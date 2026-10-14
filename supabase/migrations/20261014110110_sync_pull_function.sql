create function private.pull_sync_changes(
  p_owner_id text,
  p_device_id uuid,
  p_after_sequence bigint,
  p_after_record_id text,
  p_bootstrap boolean,
  p_limit integer
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_device public.devices%rowtype;
  v_record public.user_records%rowtype;
  v_records jsonb := '[]'::jsonb;
  v_floor bigint := 0;
  v_next_sequence bigint;
  v_next_record_id text;
  v_seen integer := 0;
  v_has_more boolean := false;
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
  if p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception using errcode = 'TV422', message = 'PAGE_LIMIT_INVALID';
  end if;
  if p_after_record_id is null or char_length(p_after_record_id) > 128 or p_bootstrap is null then
    raise exception using errcode = 'TV422', message = 'CURSOR_INVALID';
  end if;
  if p_after_sequence is not null and p_after_sequence < 0 then
    raise exception using errcode = 'TV422', message = 'CURSOR_INVALID';
  end if;

  select cursor_floor into v_floor
  from public.sync_retention_state
  where owner_id = p_owner_id;
  v_floor := coalesce(v_floor, 0);

  if not p_bootstrap and p_after_sequence is not null and p_after_sequence < v_floor then
    raise exception using errcode = 'TC410', message = 'CURSOR_EXPIRED';
  end if;

  v_next_sequence := coalesce(p_after_sequence, v_floor);
  v_next_record_id := case when p_after_sequence is null then '' else p_after_record_id end;

  for v_record in
    select *
    from public.user_records
    where owner_id = p_owner_id
      and (
        p_after_sequence is null
        or (change_sequence, record_id) > (p_after_sequence, p_after_record_id)
      )
    order by change_sequence, record_id
    limit p_limit + 1
  loop
    v_seen := v_seen + 1;
    if v_seen > p_limit then
      v_has_more := true;
      exit;
    end if;

    v_records := v_records || jsonb_build_array(jsonb_build_object(
      'collection', v_record.collection,
      'recordId', v_record.record_id,
      'revision', v_record.revision,
      'modifiedAt', v_record.modified_at,
      'deletedAt', v_record.deleted_at,
      'data', v_record.data
    ));
    v_next_sequence := v_record.change_sequence;
    v_next_record_id := v_record.record_id;
  end loop;

  if not v_has_more and v_next_sequence < v_floor then
    v_next_sequence := v_floor;
    v_next_record_id := '';
  end if;

  update public.devices
    set last_seen_at = now()
  where owner_id = p_owner_id and id = p_device_id and revoked_at is null;

  return jsonb_build_object(
    'records', v_records,
    'nextSequence', v_next_sequence::text,
    'nextRecordId', v_next_record_id,
    'hasMore', v_has_more
  );
end;
$$;

create function public.tend_pull_sync_changes(
  p_owner_id text,
  p_device_id uuid,
  p_after_sequence bigint,
  p_after_record_id text,
  p_bootstrap boolean,
  p_limit integer
) returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.pull_sync_changes($1, $2, $3, $4, $5, $6)
$$;

revoke all on function private.pull_sync_changes(text, uuid, bigint, text, boolean, integer) from public, anon, authenticated;
revoke all on function public.tend_pull_sync_changes(text, uuid, bigint, text, boolean, integer) from public, anon, authenticated;
grant execute on function private.pull_sync_changes(text, uuid, bigint, text, boolean, integer) to service_role;
grant execute on function public.tend_pull_sync_changes(text, uuid, bigint, text, boolean, integer) to service_role;
