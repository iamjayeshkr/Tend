import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'

import { asAnon, asDatabaseOwner, asUser, testDatabase } from './helpers'

let database: PGlite

beforeEach(async () => { database = await testDatabase() })
afterEach(async () => { await database.close() })

describe('secure sync schema', () => {
  it('creates the account tables, change sequence, checks, and retention indexes', async () => {
    const tables = await database.query<{ tablename: string }>(`
      select tablename from pg_tables
      where schemaname = 'public' and tablename in (
        'user_records','devices','sync_operations','sync_conflicts','security_events','sync_retention_state'
      ) order by tablename
    `)
    expect(tables.rows.map((row) => row.tablename)).toEqual([
      'devices', 'security_events', 'sync_conflicts', 'sync_operations', 'sync_retention_state', 'user_records',
    ])
    const sequences = await database.query<{ sequencename: string }>(`
      select sequencename from pg_sequences where schemaname = 'public' and sequencename = 'sync_change_sequence'
    `)
    expect(sequences.rows).toHaveLength(1)
    const indexes = await database.query<{ indexname: string }>(`
      select indexname from pg_indexes where schemaname = 'public'
    `)
    expect(indexes.rows.map((row) => row.indexname)).toEqual(expect.arrayContaining([
      'user_records_owner_change_idx',
      'user_records_tombstone_retention_idx',
      'sync_operations_expiry_idx',
      'sync_conflicts_owner_record_idx',
      'security_events_expiry_idx',
    ]))
  })

  it('grants no anon access and only explicit read access to authenticated clients', async () => {
    const grants = await database.query<{ grantee: string; table_name: string; privilege_type: string }>(`
      select grantee, table_name, privilege_type
      from information_schema.role_table_grants
      where table_schema = 'public' and grantee in ('anon','authenticated')
      order by grantee, table_name, privilege_type
    `)
    expect(grants.rows.filter((row) => row.grantee === 'anon')).toEqual([])
    expect(grants.rows.filter((row) => row.grantee === 'authenticated')).toEqual([
      { grantee: 'authenticated', table_name: 'devices', privilege_type: 'SELECT' },
      { grantee: 'authenticated', table_name: 'sync_conflicts', privilege_type: 'SELECT' },
      { grantee: 'authenticated', table_name: 'sync_retention_state', privilege_type: 'SELECT' },
      { grantee: 'authenticated', table_name: 'user_records', privilege_type: 'SELECT' },
    ])

    await asAnon(database)
    await expect(database.query('select * from public.user_records')).rejects.toThrow(/permission denied/i)
  })

  it('defines owner policies with both update predicates', async () => {
    const policies = await database.query<{ cmd: string; qual: string | null; with_check: string | null }>(`
      select cmd, qual, with_check from pg_policies
      where schemaname = 'public' and tablename = 'user_records'
      order by cmd
    `)
    expect(policies.rows.map((row) => row.cmd)).toEqual(['DELETE', 'INSERT', 'SELECT', 'UPDATE'])
    const update = policies.rows.find((row) => row.cmd === 'UPDATE')!
    expect(update.qual).toMatch(/owner_id.*auth\.jwt|auth\.jwt.*owner_id/is)
    expect(update.with_check).toMatch(/owner_id.*auth\.jwt|auth\.jwt.*owner_id/is)
  })

  it('enforces owner select and reassignment denial when mutation grants are exercised', async () => {
    await database.exec(`
      insert into public.user_records (owner_id, collection, record_id, revision, data)
      values
        ('user_a','tasks','task-a',1,'{"title":"A"}'::jsonb),
        ('user_b','tasks','task-b',1,'{"title":"B"}'::jsonb);
    `)
    await asUser(database, 'user_a')
    const visible = await database.query<{ record_id: string }>('select record_id from public.user_records order by record_id')
    expect(visible.rows).toEqual([{ record_id: 'task-a' }])
    await expect(database.exec(`insert into public.user_records (owner_id,collection,record_id,revision,data) values ('user_a','tasks','task-new',1,'{}')`)).rejects.toThrow(/permission denied/i)

    await asDatabaseOwner(database)
    await database.exec('grant insert, update, delete on public.user_records to authenticated')
    await database.exec('grant usage on sequence public.sync_change_sequence to authenticated')
    await asUser(database, 'user_a')
    await database.exec(`insert into public.user_records (owner_id,collection,record_id,revision,data) values ('user_a','tasks','task-own',1,'{}')`)
    await expect(database.exec(`insert into public.user_records (owner_id,collection,record_id,revision,data) values ('user_b','tasks','task-other',1,'{}')`)).rejects.toThrow(/row-level security/i)
    await expect(database.exec(`update public.user_records set owner_id = 'user_b' where record_id = 'task-own'`)).rejects.toThrow(/row-level security/i)
    const guessed = await database.query(`update public.user_records set revision = 2 where record_id = 'task-b' returning record_id`)
    expect(guessed.rows).toEqual([])
    const deleted = await database.query(`delete from public.user_records where record_id = 'task-b' returning record_id`)
    expect(deleted.rows).toEqual([])
  })

  it('uses composite ownership keys and indexed foreign keys', async () => {
    const constraints = await database.query<{ name: string; definition: string }>(`
      select conname as name, pg_get_constraintdef(oid) as definition
      from pg_constraint where connamespace = 'public'::regnamespace
    `)
    const definitions = constraints.rows.map((row) => `${row.name}: ${row.definition}`).join('\n')
    expect(definitions).toMatch(/user_records_owner_collection_record_key.*UNIQUE \(owner_id, collection, record_id\)/i)
    expect(definitions).toMatch(/sync_operations_pkey.*PRIMARY KEY \(owner_id, operation_id\)/i)
    expect(definitions).toMatch(/FOREIGN KEY \(owner_id, device_id\).*devices\(owner_id, id\)/i)
    expect(definitions).toMatch(/FOREIGN KEY \(owner_id, collection, record_id\).*user_records\(owner_id, collection, record_id\)/i)
  })

  it('rejects invalid collections, revisions, hashes, and cross-owner records, cursors, and conflicts', async () => {
    await expect(database.exec(`insert into public.user_records (owner_id,collection,record_id,revision,data) values ('user_a','unknown','x',1,'{}')`)).rejects.toThrow()
    await expect(database.exec(`insert into public.user_records (owner_id,collection,record_id,revision,data) values ('user_a','tasks','x',0,'{}')`)).rejects.toThrow()
    await database.exec(`insert into public.devices (id, owner_id, display_name, platform, app_version) values ('8db46216-8f06-4d87-a240-15f153c783b4','user_a','A','web','1')`)
    await expect(database.exec(`insert into public.sync_operations (owner_id,operation_id,device_id,request_hash,status) values ('user_a','e5e5657e-5c83-4c93-8203-ae263fa6916c','8db46216-8f06-4d87-a240-15f153c783b4','short','complete')`)).rejects.toThrow()

    await database.exec(`
      insert into public.user_records (owner_id,collection,record_id,revision,data) values ('user_b','tasks','task-b',1,'{}');
      insert into public.sync_retention_state (owner_id,cursor_floor) values ('user_b',99);
      insert into public.sync_conflicts (owner_id,collection,record_id,server_revision,client_data,server_data)
      values ('user_b','tasks','task-b',1,'{}','{}');
    `)
    await asUser(database, 'user_a')
    expect((await database.query(`select * from public.user_records where record_id = 'task-b'`)).rows).toEqual([])
    expect((await database.query(`select * from public.sync_retention_state where owner_id = 'user_b'`)).rows).toEqual([])
    expect((await database.query(`select * from public.sync_conflicts where record_id = 'task-b'`)).rows).toEqual([])
  })
})
