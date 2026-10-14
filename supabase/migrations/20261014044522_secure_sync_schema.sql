create sequence public.sync_change_sequence as bigint;

create table public.devices (
  owner_id text not null,
  id uuid not null,
  display_name text not null check (char_length(display_name) between 1 and 100),
  platform text not null check (platform in ('web', 'desktop')),
  app_version text not null check (char_length(app_version) between 1 and 40),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key (owner_id, id)
);

create table public.user_records (
  id uuid not null default gen_random_uuid(),
  owner_id text not null,
  collection text not null check (collection in (
    'tasks', 'routine', 'activities', 'ideas', 'reviews', 'sets', 'wakeLogs', 'sleepLogs', 'settings'
  )),
  record_id text not null check (char_length(record_id) between 1 and 128),
  revision bigint not null check (revision > 0),
  data jsonb,
  modified_at timestamptz not null default now(),
  deleted_at timestamptz,
  change_sequence bigint not null default nextval('public.sync_change_sequence'),
  primary key (owner_id, id),
  constraint user_records_owner_collection_record_key unique (owner_id, collection, record_id),
  constraint user_records_live_or_tombstone_check check (
    (deleted_at is null and data is not null and jsonb_typeof(data) = 'object')
    or (deleted_at is not null and data is null)
  )
);

create table public.sync_operations (
  owner_id text not null,
  operation_id uuid not null,
  device_id uuid not null,
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  status text not null check (status in ('processing', 'complete', 'failed')),
  response jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  expires_at timestamptz not null default (now() + interval '30 days'),
  primary key (owner_id, operation_id),
  constraint sync_operations_owner_device_fkey
    foreign key (owner_id, device_id) references public.devices (owner_id, id) on delete cascade,
  constraint sync_operations_completion_check check (
    (status = 'processing' and completed_at is null)
    or (status in ('complete', 'failed') and completed_at is not null)
  )
);

create table public.sync_conflicts (
  owner_id text not null,
  id uuid not null default gen_random_uuid(),
  collection text not null check (collection in (
    'tasks', 'routine', 'activities', 'ideas', 'reviews', 'sets', 'wakeLogs', 'sleepLogs', 'settings'
  )),
  record_id text not null,
  operation_id uuid,
  server_revision bigint not null check (server_revision > 0),
  changed_fields text[] not null default '{}',
  client_data jsonb not null check (jsonb_typeof(client_data) = 'object'),
  server_data jsonb not null check (jsonb_typeof(server_data) = 'object'),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  expires_at timestamptz not null default (now() + interval '90 days'),
  primary key (owner_id, id),
  constraint sync_conflicts_owner_record_fkey
    foreign key (owner_id, collection, record_id)
    references public.user_records (owner_id, collection, record_id) on delete cascade,
  constraint sync_conflicts_owner_operation_fkey
    foreign key (owner_id, operation_id)
    references public.sync_operations (owner_id, operation_id) on delete set null
);

create table public.security_events (
  id uuid primary key default gen_random_uuid(),
  owner_id text,
  device_id uuid,
  event_type text not null check (char_length(event_type) between 1 and 100),
  request_id text not null check (char_length(request_id) between 1 and 100),
  ip_hash text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '90 days')
);

create table public.sync_retention_state (
  owner_id text primary key,
  cursor_floor bigint not null default 0 check (cursor_floor >= 0),
  updated_at timestamptz not null default now()
);

create index user_records_owner_change_idx
  on public.user_records (owner_id, change_sequence, record_id);
create index user_records_tombstone_retention_idx
  on public.user_records (deleted_at) where deleted_at is not null;
create index devices_owner_revoked_idx
  on public.devices (owner_id, revoked_at, id);
create index sync_operations_device_idx
  on public.sync_operations (owner_id, device_id, started_at);
create index sync_operations_expiry_idx
  on public.sync_operations (expires_at);
create index sync_conflicts_owner_record_idx
  on public.sync_conflicts (owner_id, collection, record_id, resolved_at);
create index sync_conflicts_operation_idx
  on public.sync_conflicts (owner_id, operation_id) where operation_id is not null;
create index sync_conflicts_expiry_idx
  on public.sync_conflicts (expires_at);
create index security_events_owner_created_idx
  on public.security_events (owner_id, created_at desc) where owner_id is not null;
create index security_events_expiry_idx
  on public.security_events (expires_at);

alter table public.user_records enable row level security;
alter table public.user_records force row level security;
alter table public.devices enable row level security;
alter table public.devices force row level security;
alter table public.sync_operations enable row level security;
alter table public.sync_operations force row level security;
alter table public.sync_conflicts enable row level security;
alter table public.sync_conflicts force row level security;
alter table public.security_events enable row level security;
alter table public.security_events force row level security;
alter table public.sync_retention_state enable row level security;
alter table public.sync_retention_state force row level security;

create policy user_records_select_owner on public.user_records
  for select to authenticated
  using ((select auth.jwt() ->> 'sub') = owner_id);
create policy user_records_insert_owner on public.user_records
  for insert to authenticated
  with check ((select auth.jwt() ->> 'sub') = owner_id);
create policy user_records_update_owner on public.user_records
  for update to authenticated
  using ((select auth.jwt() ->> 'sub') = owner_id)
  with check ((select auth.jwt() ->> 'sub') = owner_id);
create policy user_records_delete_owner on public.user_records
  for delete to authenticated
  using ((select auth.jwt() ->> 'sub') = owner_id);

create policy devices_select_owner on public.devices
  for select to authenticated
  using ((select auth.jwt() ->> 'sub') = owner_id);
create policy sync_operations_select_owner on public.sync_operations
  for select to authenticated
  using ((select auth.jwt() ->> 'sub') = owner_id);
create policy sync_conflicts_select_owner on public.sync_conflicts
  for select to authenticated
  using ((select auth.jwt() ->> 'sub') = owner_id);
create policy sync_retention_state_select_owner on public.sync_retention_state
  for select to authenticated
  using ((select auth.jwt() ->> 'sub') = owner_id);

revoke all on table public.user_records from public, anon, authenticated;
revoke all on table public.devices from public, anon, authenticated;
revoke all on table public.sync_operations from public, anon, authenticated;
revoke all on table public.sync_conflicts from public, anon, authenticated;
revoke all on table public.security_events from public, anon, authenticated;
revoke all on table public.sync_retention_state from public, anon, authenticated;
revoke all on sequence public.sync_change_sequence from public, anon, authenticated;

grant select on table public.user_records to authenticated;
grant select on table public.devices to authenticated;
grant select on table public.sync_conflicts to authenticated;
grant select on table public.sync_retention_state to authenticated;

grant all on table public.user_records to service_role;
grant all on table public.devices to service_role;
grant all on table public.sync_operations to service_role;
grant all on table public.sync_conflicts to service_role;
grant all on table public.security_events to service_role;
grant all on table public.sync_retention_state to service_role;
grant usage, select on sequence public.sync_change_sequence to service_role;
