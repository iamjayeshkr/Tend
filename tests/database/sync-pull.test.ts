import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'

import { asDatabaseOwner, asServiceRole, testDatabase } from './helpers'

const DEVICE_ID = '8db46216-8f06-4d87-a240-15f153c783b4'
const OWNER_ID = 'user_a'

type PullPage = {
  records: Array<{ collection: string; recordId: string; revision: number; data: unknown; deletedAt: string | null }>
  nextSequence: string
  nextRecordId: string
  hasMore: boolean
}

let database: PGlite
beforeEach(async () => {
  database = await testDatabase()
  await asServiceRole(database)
  await database.query(
    'select public.tend_register_device($1, $2::uuid, $3, $4, $5)',
    [OWNER_ID, DEVICE_ID, 'Test browser', 'web', '1.1.14'],
  )
})
afterEach(async () => { await database.close() })

async function pull(
  afterSequence: string | null,
  afterRecordId: string,
  limit: number,
  ownerId = OWNER_ID,
  bootstrap = afterSequence === null,
): Promise<PullPage> {
  await asServiceRole(database)
  const result = await database.query<{ response: PullPage }>(
    'select public.tend_pull_sync_changes($1, $2::uuid, $3::bigint, $4, $5::boolean, $6) as response',
    [ownerId, DEVICE_ID, afterSequence, afterRecordId, bootstrap, limit],
  )
  return result.rows[0]!.response
}

async function insertRecord(ownerId: string, recordId: string, sequence: number, deleted = false): Promise<void> {
  await asDatabaseOwner(database)
  await database.query(`
    insert into public.user_records (
      owner_id, collection, record_id, revision, data, deleted_at, change_sequence
    ) values ($1, 'tasks', $2, 1, $3::jsonb, $4::timestamptz, $5)
  `, [
    ownerId,
    recordId,
    deleted ? null : JSON.stringify({ title: recordId, done: false, date: '2026-10-14', category: 'work' }),
    deleted ? '2026-10-14T05:00:00.000Z' : null,
    sequence,
  ])
}

describe('incremental pull database boundary', () => {
  it('orders and paginates by (change_sequence, record_id) without leaking another owner', async () => {
    await insertRecord(OWNER_ID, 'task-z', 10)
    await insertRecord(OWNER_ID, 'task-a', 10)
    await insertRecord(OWNER_ID, 'task-later', 11)
    await insertRecord('user_b', 'guessed-private-id', 9)

    const first = await pull(null, '', 2)
    expect(first.records.map((record) => record.recordId)).toEqual(['task-a', 'task-z'])
    expect(first).toMatchObject({ nextSequence: '10', nextRecordId: 'task-z', hasMore: true })
    expect(JSON.stringify(first)).not.toContain('guessed-private-id')

    const second = await pull(first.nextSequence, first.nextRecordId, 2)
    expect(second.records.map((record) => record.recordId)).toEqual(['task-later'])
    expect(second).toMatchObject({ nextSequence: '11', nextRecordId: 'task-later', hasMore: false })
  })

  it('includes tombstones and keeps an empty-page cursor stable', async () => {
    await insertRecord(OWNER_ID, 'deleted-task', 20, true)
    const first = await pull(null, '', 100)
    expect(first.records).toMatchObject([{
      recordId: 'deleted-task', data: null,
    }])
    expect(new Date(first.records[0]!.deletedAt!).toISOString()).toBe('2026-10-14T05:00:00.000Z')
    const empty = await pull(first.nextSequence, first.nextRecordId, 100)
    expect(empty).toEqual({
      records: [],
      nextSequence: first.nextSequence,
      nextRecordId: first.nextRecordId,
      hasMore: false,
    })
  })

  it('rejects pages above 500 inside PostgreSQL', async () => {
    await expect(pull(null, '', 501)).rejects.toThrow(/PAGE_LIMIT_INVALID/)
  })

  it('returns CURSOR_EXPIRED below the owner retention floor but allows bootstrap', async () => {
    await insertRecord(OWNER_ID, 'current-task', 25)
    await asDatabaseOwner(database)
    await database.exec(`insert into public.sync_retention_state (owner_id, cursor_floor) values ('${OWNER_ID}', 20)`)
    await expect(pull('19', 'old-task', 100)).rejects.toThrow(/CURSOR_EXPIRED/)
    await expect(pull(null, '', 100)).resolves.toMatchObject({ records: [{ recordId: 'current-task' }] })
  })

  it('finishes a paged bootstrap below the retention floor before advancing to that floor', async () => {
    await insertRecord(OWNER_ID, 'old-a', 1)
    await insertRecord(OWNER_ID, 'old-b', 2)
    await insertRecord(OWNER_ID, 'old-c', 3)
    await asDatabaseOwner(database)
    await database.exec(`insert into public.sync_retention_state (owner_id, cursor_floor) values ('${OWNER_ID}', 20)`)

    const first = await pull(null, '', 2)
    expect(first).toMatchObject({ nextSequence: '2', hasMore: true })
    const final = await pull(first.nextSequence, first.nextRecordId, 2, OWNER_ID, true)
    expect(final.records.map((record) => record.recordId)).toEqual(['old-c'])
    expect(final).toMatchObject({ nextSequence: '20', nextRecordId: '', hasMore: false })
  })

  it('rejects revoked and unknown devices without revealing record existence', async () => {
    await insertRecord(OWNER_ID, 'private-task', 1)
    await asDatabaseOwner(database)
    await database.exec(`update public.devices set revoked_at = now() where owner_id = '${OWNER_ID}' and id = '${DEVICE_ID}'`)
    await expect(pull(null, '', 100)).rejects.toThrow(/DEVICE_REVOKED/)
    await expect(pull(null, '', 100, 'user_b')).rejects.toThrow(/DEVICE_UNKNOWN/)
  })

  it('grants only service_role access to the security-invoker wrapper', async () => {
    await asDatabaseOwner(database)
    const metadata = await database.query<{ security_definer: boolean; config: string[] | null }>(`
      select p.prosecdef as security_definer, p.proconfig as config
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'tend_pull_sync_changes'
    `)
    expect(metadata.rows).toEqual([expect.objectContaining({ security_definer: false })])
    expect(metadata.rows[0]?.config).toContain('search_path=""')
    for (const role of ['anon', 'authenticated']) {
      const privilege = await database.query<{ allowed: boolean }>(`
        select has_function_privilege('${role}', 'public.tend_pull_sync_changes(text,uuid,bigint,text,boolean,integer)', 'EXECUTE') as allowed
      `)
      expect(privilege.rows[0]?.allowed).toBe(false)
    }
  })
})
