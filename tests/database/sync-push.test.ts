import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'

import { asDatabaseOwner, asServiceRole, testDatabase } from './helpers'

const DEVICE_ID = '8db46216-8f06-4d87-a240-15f153c783b4'
const OWNER_ID = 'user_a'

type SqlPushResult = {
  results: Array<{
    operationId: string
    status: 'applied' | 'duplicate' | 'conflict'
    revision?: number
    record?: { collection: string; recordId: string; revision: number }
    conflictId?: string
  }>
}

function operation(index: number, overrides: Record<string, unknown> = {}) {
  return {
    operationId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    collection: 'tasks',
    recordId: `task-${index}`,
    kind: 'put',
    baseRevision: 0,
    changedAt: '2026-10-14T04:30:00.000Z',
    data: { title: `Task ${index}`, done: false, date: '2026-10-14', category: 'work' },
    requestHash: index.toString(16).padStart(64, '0'),
    ...overrides,
  }
}

async function register(database: PGlite, ownerId = OWNER_ID): Promise<void> {
  await asServiceRole(database)
  await database.query(
    'select public.tend_register_device($1, $2::uuid, $3, $4, $5)',
    [ownerId, DEVICE_ID, 'Test browser', 'web', '1.1.14'],
  )
}

async function push(
  database: PGlite,
  operations: unknown[],
  ownerId = OWNER_ID,
): Promise<SqlPushResult> {
  await asServiceRole(database)
  const result = await database.query<{ response: SqlPushResult }>(
    'select public.tend_apply_sync_push($1, $2::uuid, $3::jsonb) as response',
    [ownerId, DEVICE_ID, JSON.stringify(operations)],
  )
  return result.rows[0]!.response
}

let database: PGlite
beforeEach(async () => { database = await testDatabase() })
afterEach(async () => { await database.close() })

describe('sync push database boundary', () => {
  it('exposes security-invoker wrappers only to service_role', async () => {
    const functions = await database.query<{ schema_name: string; name: string; security_definer: boolean; config: string[] | null }>(`
      select n.nspname as schema_name, p.proname as name, p.prosecdef as security_definer, p.proconfig as config
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where p.proname in ('apply_sync_push','tend_apply_sync_push','register_sync_device','tend_register_device','validate_sync_migration','tend_validate_sync_migration')
      order by n.nspname, p.proname
    `)
    expect(functions.rows).toHaveLength(6)
    expect(functions.rows.every((row) => row.security_definer === false)).toBe(true)
    expect(functions.rows.every((row) => row.config?.some((entry) => entry === 'search_path=""'))).toBe(true)
    // Role privilege checks include grants inherited from PostgreSQL's PUBLIC pseudo-role.
    for (const role of ['anon', 'authenticated']) {
      const privileges = await database.query<{ allowed: boolean }>(`
        select has_function_privilege('${role}', 'public.tend_apply_sync_push(text,uuid,jsonb)', 'EXECUTE') as allowed
      `)
      expect(privileges.rows[0]?.allowed).toBe(false)
    }
  })

  it('registers only display metadata and rejects unknown or revoked devices', async () => {
    await expect(push(database, [operation(1)])).rejects.toThrow(/DEVICE_UNKNOWN/)
    await register(database)
    await asDatabaseOwner(database)
    const columns = await database.query<{ column_name: string }>(`
      select column_name from information_schema.columns where table_schema = 'public' and table_name = 'devices'
    `)
    const names = columns.rows.map((row) => row.column_name)
    expect(names).toEqual(expect.arrayContaining(['display_name', 'platform', 'app_version']))
    expect(names).not.toEqual(expect.arrayContaining(['hardware_id', 'advertising_id', 'fingerprint']))

    await database.exec(`update public.devices set revoked_at = now() where owner_id = '${OWNER_ID}' and id = '${DEVICE_ID}'`)
    await expect(push(database, [operation(1)])).rejects.toThrow(/DEVICE_REVOKED/)
  })

  it('validates a migration without writing records or operation claims', async () => {
    await register(database)
    const validation = await database.query<{ response: { accepted: boolean; recordCount: number; conflicts: unknown[] } }>(
      'select public.tend_validate_sync_migration($1, $2::uuid, $3::jsonb) as response',
      [OWNER_ID, DEVICE_ID, JSON.stringify([operation(1)])],
    )
    expect(validation.rows[0]?.response).toEqual({ accepted: true, recordCount: 1, conflicts: [] })
    await asDatabaseOwner(database)
    expect((await database.query('select * from public.user_records')).rows).toEqual([])
    expect((await database.query('select * from public.sync_operations')).rows).toEqual([])
  })

  it('atomically claims operations, replays identical completion, and rejects hash changes or in-flight duplicates', async () => {
    await register(database)
    const first = await push(database, [operation(1)])
    expect(first.results).toMatchObject([{ status: 'applied', revision: 1 }])
    const replay = await push(database, [operation(1)])
    expect(replay.results).toMatchObject([{ status: 'duplicate', revision: 1 }])
    await expect(push(database, [operation(1, { requestHash: 'f'.repeat(64) })])).rejects.toThrow(/IDEMPOTENCY_MISMATCH/)

    await asDatabaseOwner(database)
    await database.exec(`
      insert into public.sync_operations (owner_id, operation_id, device_id, request_hash, status)
      values ('${OWNER_ID}', '00000000-0000-4000-8000-000000000002', '${DEVICE_ID}', '${'2'.padStart(64, '0')}', 'processing')
    `)
    await expect(push(database, [operation(2)])).rejects.toThrow(/IDEMPOTENCY_IN_FLIGHT/)
  })

  it('applies records in deterministic collection/record order and keeps owners isolated', async () => {
    await register(database)
    const result = await push(database, [
      operation(2, { recordId: 'z-last' }),
      operation(1, { recordId: 'a-first' }),
    ])
    expect(result.results.map((item) => item.record?.recordId)).toEqual(['a-first', 'z-last'])

    await register(database, 'user_b')
    await push(database, [operation(3, { recordId: 'a-first' })], 'user_b')
    await asDatabaseOwner(database)
    const owners = await database.query<{ owner_id: string }>(`
      select owner_id from public.user_records where record_id = 'a-first' order by owner_id
    `)
    expect(owners.rows).toEqual([{ owner_id: 'user_a' }, { owner_id: 'user_b' }])
  })

  it('enforces the 100-operation cap inside PostgreSQL', async () => {
    await register(database)
    await expect(push(database, Array.from({ length: 101 }, (_, index) => operation(index + 1)))).rejects.toThrow(/BATCH_TOO_LARGE/)
  })

  it('preserves the server record and creates recovery metadata on revision conflict', async () => {
    await register(database)
    await push(database, [operation(1)])
    const conflict = await push(database, [operation(2, { recordId: 'task-1', baseRevision: 0 })])
    expect(conflict.results[0]).toMatchObject({ status: 'conflict', record: { revision: 1 } })
    expect(conflict.results[0]?.conflictId).toMatch(/^[0-9a-f-]{36}$/)
    await asDatabaseOwner(database)
    expect((await database.query('select * from public.sync_conflicts')).rows).toHaveLength(1)
    const record = await database.query<{ revision: number; data: { title: string } }>(`
      select revision, data from public.user_records where owner_id = '${OWNER_ID}' and record_id = 'task-1'
    `)
    expect(record.rows[0]).toMatchObject({ revision: 1, data: { title: 'Task 1' } })
  })

  it('allows one focus completion per stable activity record', async () => {
    await register(database)
    const activity = operation(1, {
      collection: 'activities', recordId: 'focus-session-1',
      data: { title: 'Focus', category: 'work', start: 1, end: 2, createdAt: 1, modifiedAt: 2, source: 'timer' },
    })
    const duplicateCompletion = operation(2, { ...activity, operationId: operation(2).operationId, requestHash: '2'.padStart(64, '0') })
    expect((await push(database, [activity])).results[0]?.status).toBe('applied')
    expect((await push(database, [duplicateCompletion])).results[0]?.status).toBe('conflict')
    await asDatabaseOwner(database)
    const count = await database.query<{ count: number }>(`
      select count(*)::int as count from public.user_records where owner_id = '${OWNER_ID}' and collection = 'activities' and record_id = 'focus-session-1'
    `)
    expect(count.rows[0]?.count).toBe(1)
  })

  it('rolls the entire transaction back after a mid-batch error', async () => {
    await register(database)
    const invalid = operation(2, { recordId: 'z-invalid', requestHash: 'not-a-hash' })
    await expect(push(database, [operation(1, { recordId: 'a-valid' }), invalid])).rejects.toThrow(/INVALID_REQUEST_HASH/)
    await asDatabaseOwner(database)
    expect((await database.query('select * from public.user_records')).rows).toEqual([])
    expect((await database.query('select * from public.sync_operations')).rows).toEqual([])
  })
})
