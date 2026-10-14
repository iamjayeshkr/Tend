create schema if not exists private;

revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

create function private.register_sync_device(
  p_owner_id text,
  p_device_id uuid,
  p_display_name text,
  p_platform text,
  p_app_version text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_exists boolean := false;
  v_revoked_at timestamptz;
begin
  if p_owner_id is null or p_owner_id = '' then
    raise exception using errcode = 'TV422', message = 'INVALID_OWNER';
  end if;

  select true, revoked_at
    into v_exists, v_revoked_at
  from public.devices
  where owner_id = p_owner_id and id = p_device_id;

  if v_exists and v_revoked_at is not null then
    raise exception using errcode = 'TD402', message = 'DEVICE_REVOKED';
  end if;

  insert into public.devices (owner_id, id, display_name, platform, app_version)
  values (p_owner_id, p_device_id, p_display_name, p_platform, p_app_version)
  on conflict (owner_id, id) do update
    set display_name = excluded.display_name,
        platform = excluded.platform,
        app_version = excluded.app_version,
        last_seen_at = now()
  where public.devices.owner_id = p_owner_id
    and public.devices.id = p_device_id
    and public.devices.revoked_at is null;

  return jsonb_build_object('status', case when v_exists then 'active' else 'registered' end);
end;
$$;

create function private.validate_sync_migration(
  p_owner_id text,
  p_device_id uuid,
  p_operations jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_device public.devices%rowtype;
  v_operation jsonb;
  v_record public.user_records%rowtype;
  v_conflicts jsonb := '[]'::jsonb;
  v_count integer;
  v_base_revision bigint;
begin
  select * into v_device
  from public.devices
  where owner_id = p_owner_id and id = p_device_id;

  if not found then
    raise exception using errcode = 'TD401', message = 'DEVICE_UNKNOWN';
  end if;
  if v_device.revoked_at is not null then
    raise exception using errcode = 'TD402', message = 'DEVICE_REVOKED';
  end if;
  if jsonb_typeof(p_operations) <> 'array' then
    raise exception using errcode = 'TV422', message = 'INVALID_OPERATIONS';
  end if;

  v_count := jsonb_array_length(p_operations);
  if v_count > 100 then
    raise exception using errcode = 'TV422', message = 'BATCH_TOO_LARGE';
  end if;

  for v_operation in
    select item
    from jsonb_array_elements(p_operations) with ordinality as operation(item, position)
    order by item->>'collection', item->>'recordId', position
  loop
    if jsonb_typeof(v_operation) <> 'object'
      or not (v_operation ?& array['operationId','collection','recordId','kind','baseRevision','changedAt','requestHash'])
      or (v_operation - array['operationId','collection','recordId','kind','baseRevision','changedAt','data','changedFields','requestHash']) <> '{}'::jsonb
      or (v_operation->>'collection') not in ('tasks','routine','activities','ideas','reviews','sets','wakeLogs','sleepLogs','settings')
      or (v_operation->>'kind') not in ('put','patch','delete')
      or (v_operation->>'baseRevision') !~ '^\d+$'
      or (v_operation->>'requestHash') !~ '^[0-9a-f]{64}$'
    then
      raise exception using errcode = 'TV422', message = 'INVALID_OPERATION';
    end if;

    perform (v_operation->>'operationId')::uuid;
    perform (v_operation->>'changedAt')::timestamptz;
    v_base_revision := (v_operation->>'baseRevision')::bigint;

    select * into v_record
    from public.user_records
    where owner_id = p_owner_id
      and collection = v_operation->>'collection'
      and record_id = v_operation->>'recordId';

    if found and v_record.revision <> v_base_revision then
      v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object(
        'collection', v_operation->>'collection',
        'recordId', v_operation->>'recordId',
        'reason', 'REVISION_MISMATCH'
      ));
    elsif not found and v_base_revision <> 0 then
      v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object(
        'collection', v_operation->>'collection',
        'recordId', v_operation->>'recordId',
        'reason', 'RECORD_MISSING'
      ));
    end if;
  end loop;

  return jsonb_build_object(
    'accepted', jsonb_array_length(v_conflicts) = 0,
    'recordCount', v_count,
    'conflicts', v_conflicts
  );
end;
$$;

create function private.apply_sync_push(
  p_owner_id text,
  p_device_id uuid,
  p_operations jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_device public.devices%rowtype;
  v_operation jsonb;
  v_existing_operation public.sync_operations%rowtype;
  v_record public.user_records%rowtype;
  v_results jsonb := '[]'::jsonb;
  v_result jsonb;
  v_server_record jsonb;
  v_new_data jsonb;
  v_conflict_id uuid;
  v_changed_fields text[];
  v_operation_id uuid;
  v_request_hash text;
  v_collection text;
  v_record_id text;
  v_kind text;
  v_base_revision bigint;
  v_claimed integer;
  v_count integer;
  v_record_exists boolean;
begin
  select * into v_device
  from public.devices
  where owner_id = p_owner_id and id = p_device_id;

  if not found then
    raise exception using errcode = 'TD401', message = 'DEVICE_UNKNOWN';
  end if;
  if v_device.revoked_at is not null then
    raise exception using errcode = 'TD402', message = 'DEVICE_REVOKED';
  end if;
  if jsonb_typeof(p_operations) <> 'array' then
    raise exception using errcode = 'TV422', message = 'INVALID_OPERATIONS';
  end if;

  v_count := jsonb_array_length(p_operations);
  if v_count > 100 then
    raise exception using errcode = 'TV422', message = 'BATCH_TOO_LARGE';
  end if;

  for v_operation in
    select item
    from jsonb_array_elements(p_operations) with ordinality as operation(item, position)
    order by item->>'collection', item->>'recordId', position
  loop
    if jsonb_typeof(v_operation) <> 'object'
      or not (v_operation ?& array['operationId','collection','recordId','kind','baseRevision','changedAt','requestHash'])
      or (v_operation - array['operationId','collection','recordId','kind','baseRevision','changedAt','data','changedFields','requestHash']) <> '{}'::jsonb
      or (v_operation->>'collection') not in ('tasks','routine','activities','ideas','reviews','sets','wakeLogs','sleepLogs','settings')
      or (v_operation->>'kind') not in ('put','patch','delete')
      or (v_operation->>'baseRevision') !~ '^\d+$'
    then
      raise exception using errcode = 'TV422', message = 'INVALID_OPERATION';
    end if;

    v_request_hash := v_operation->>'requestHash';
    if v_request_hash !~ '^[0-9a-f]{64}$' then
      raise exception using errcode = 'TV422', message = 'INVALID_REQUEST_HASH';
    end if;

    begin
      v_operation_id := (v_operation->>'operationId')::uuid;
      perform (v_operation->>'changedAt')::timestamptz;
      v_base_revision := (v_operation->>'baseRevision')::bigint;
    exception when others then
      raise exception using errcode = 'TV422', message = 'INVALID_OPERATION';
    end;

    v_collection := v_operation->>'collection';
    v_record_id := v_operation->>'recordId';
    v_kind := v_operation->>'kind';
    if char_length(v_record_id) not between 1 and 128 then
      raise exception using errcode = 'TV422', message = 'INVALID_RECORD_ID';
    end if;
    if v_kind in ('put','patch') and jsonb_typeof(v_operation->'data') <> 'object' then
      raise exception using errcode = 'TV422', message = 'INVALID_RECORD_DATA';
    end if;
    if v_kind = 'delete' and (v_operation ? 'data' or v_operation ? 'changedFields') then
      raise exception using errcode = 'TV422', message = 'INVALID_DELETE';
    end if;
    if v_operation ? 'changedFields' and jsonb_typeof(v_operation->'changedFields') <> 'array' then
      raise exception using errcode = 'TV422', message = 'INVALID_CHANGED_FIELDS';
    end if;

    insert into public.sync_operations (
      owner_id, operation_id, device_id, request_hash, status
    ) values (
      p_owner_id, v_operation_id, p_device_id, v_request_hash, 'processing'
    ) on conflict (owner_id, operation_id) do nothing;
    get diagnostics v_claimed = row_count;

    if v_claimed = 0 then
      select * into v_existing_operation
      from public.sync_operations
      where owner_id = p_owner_id and operation_id = v_operation_id;

      if v_existing_operation.request_hash <> v_request_hash then
        raise exception using errcode = 'TH422', message = 'IDEMPOTENCY_MISMATCH';
      end if;
      if v_existing_operation.status = 'processing' then
        raise exception using errcode = 'TI409', message = 'IDEMPOTENCY_IN_FLIGHT';
      end if;
      if v_existing_operation.status <> 'complete' or v_existing_operation.response is null then
        raise exception using errcode = 'TI409', message = 'IDEMPOTENCY_IN_FLIGHT';
      end if;

      v_result := v_existing_operation.response || jsonb_build_object('status', 'duplicate');
      v_results := v_results || jsonb_build_array(v_result);
      continue;
    end if;

    select * into v_record
    from public.user_records
    where owner_id = p_owner_id
      and collection = v_collection
      and record_id = v_record_id
    for update;
    v_record_exists := found;

    if (v_record_exists and v_record.revision <> v_base_revision)
      or (not v_record_exists and v_base_revision <> 0)
    then
      v_conflict_id := null;
      v_server_record := null;

      if v_record_exists then
        select coalesce(array_agg(field), '{}'::text[])
          into v_changed_fields
        from jsonb_array_elements_text(coalesce(v_operation->'changedFields', '[]'::jsonb)) as fields(field);

        insert into public.sync_conflicts (
          owner_id, collection, record_id, operation_id, server_revision,
          changed_fields, client_data, server_data
        ) values (
          p_owner_id, v_collection, v_record_id, v_operation_id, v_record.revision,
          v_changed_fields, coalesce(v_operation->'data', '{}'::jsonb), coalesce(v_record.data, '{}'::jsonb)
        ) returning id into v_conflict_id;

        v_server_record := jsonb_build_object(
          'collection', v_record.collection,
          'recordId', v_record.record_id,
          'revision', v_record.revision,
          'modifiedAt', v_record.modified_at,
          'deletedAt', v_record.deleted_at,
          'data', v_record.data
        );
      end if;

      v_result := jsonb_build_object(
        'operationId', v_operation_id,
        'status', 'conflict',
        'record', v_server_record,
        'conflictId', v_conflict_id
      );
      if not v_record_exists then
        v_result := v_result - 'record' - 'conflictId';
      end if;
      update public.sync_operations
        set status = 'complete', response = v_result, completed_at = now()
      where owner_id = p_owner_id and operation_id = v_operation_id;
      v_results := v_results || jsonb_build_array(v_result);
      continue;
    end if;

    if v_kind = 'delete' then
      v_new_data := null;
    elsif v_kind = 'patch' and v_record_exists and v_record.deleted_at is null then
      v_new_data := v_record.data || (v_operation->'data');
    else
      v_new_data := v_operation->'data';
    end if;

    insert into public.user_records (
      owner_id, collection, record_id, revision, data, modified_at, deleted_at
    ) values (
      p_owner_id,
      v_collection,
      v_record_id,
      case when v_record_exists then v_record.revision + 1 else 1 end,
      v_new_data,
      now(),
      case when v_kind = 'delete' then now() else null end
    )
    on conflict (owner_id, collection, record_id) do update
      set revision = excluded.revision,
          data = excluded.data,
          modified_at = excluded.modified_at,
          deleted_at = excluded.deleted_at,
          change_sequence = nextval('public.sync_change_sequence')
      where public.user_records.owner_id = p_owner_id
        and public.user_records.collection = v_collection
        and public.user_records.record_id = v_record_id
    returning * into v_record;

    v_server_record := jsonb_build_object(
      'collection', v_record.collection,
      'recordId', v_record.record_id,
      'revision', v_record.revision,
      'modifiedAt', v_record.modified_at,
      'deletedAt', v_record.deleted_at,
      'data', v_record.data
    );
    v_result := jsonb_build_object(
      'operationId', v_operation_id,
      'status', 'applied',
      'revision', v_record.revision,
      'record', v_server_record
    );

    update public.sync_operations
      set status = 'complete', response = v_result, completed_at = now()
    where owner_id = p_owner_id and operation_id = v_operation_id;
    v_results := v_results || jsonb_build_array(v_result);
  end loop;

  update public.devices
    set last_seen_at = now()
  where owner_id = p_owner_id and id = p_device_id and revoked_at is null;

  return jsonb_build_object('results', v_results);
end;
$$;

create function public.tend_register_device(
  p_owner_id text,
  p_device_id uuid,
  p_display_name text,
  p_platform text,
  p_app_version text
) returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.register_sync_device($1, $2, $3, $4, $5)
$$;

create function public.tend_validate_sync_migration(
  p_owner_id text,
  p_device_id uuid,
  p_operations jsonb
) returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.validate_sync_migration($1, $2, $3)
$$;

create function public.tend_apply_sync_push(
  p_owner_id text,
  p_device_id uuid,
  p_operations jsonb
) returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.apply_sync_push($1, $2, $3)
$$;

revoke all on function private.register_sync_device(text, uuid, text, text, text) from public, anon, authenticated;
revoke all on function private.validate_sync_migration(text, uuid, jsonb) from public, anon, authenticated;
revoke all on function private.apply_sync_push(text, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.tend_register_device(text, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.tend_validate_sync_migration(text, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.tend_apply_sync_push(text, uuid, jsonb) from public, anon, authenticated;

grant execute on function private.register_sync_device(text, uuid, text, text, text) to service_role;
grant execute on function private.validate_sync_migration(text, uuid, jsonb) to service_role;
grant execute on function private.apply_sync_push(text, uuid, jsonb) to service_role;
grant execute on function public.tend_register_device(text, uuid, text, text, text) to service_role;
grant execute on function public.tend_validate_sync_migration(text, uuid, jsonb) to service_role;
grant execute on function public.tend_apply_sync_push(text, uuid, jsonb) to service_role;
