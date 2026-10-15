import { describe, expect, it, vi } from 'vitest'

import { DatabaseFailure, type PullDatabase } from './database'
import { pullChanges, type PullServiceContext } from './pullService'
import type { RemoteRecord } from '../../../src/sync/types'

const DEVICE_ID = '8db46216-8f06-4d87-a240-15f153c783b4'
const CURSOR_SECRET = 'test-only-cursor-encryption-key-32-bytes-minimum'

function record(overrides: Partial<RemoteRecord> = {}): RemoteRecord {
  return {
    collection: 'tasks',
    recordId: 'task-a',
    revision: 1,
    modifiedAt: '2026-10-14T04:30:00.000Z',
    deletedAt: null,
    data: { title: 'A', done: false, date: '2026-10-14', category: 'work' },
    ...overrides,
  }
}

function database(overrides: Partial<PullDatabase> = {}): PullDatabase {
  return {
    pullChanges: vi.fn(async () => ({
      records: [record()],
      nextSequence: '42',
      nextRecordId: 'task-a',
      hasMore: false,
    })),
    ...overrides,
  }
}

function context(db = database()): PullServiceContext {
  return {
    principal: {
      ownerId: 'user_verified',
      sessionId: 'session_verified',
      requestId: 'request-123',
      factorVerificationAge: null,
    },
    database: db,
    cursorSecret: CURSOR_SECRET,
  }
}

describe('pullChanges', () => {
  it('derives owner from the principal and returns no raw sequence internals', async () => {
    const db = database()
    const response = await pullChanges(context(db), { deviceId: DEVICE_ID, limit: 100 })
    expect(response.records).toEqual([record()])
    expect(response.cursor).toMatch(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
    expect(response.cursor).not.toContain('42')
    expect(response.cursor).not.toContain('task-a')
    expect(db.pullChanges).toHaveBeenCalledWith({
      ownerId: 'user_verified',
      deviceId: DEVICE_ID,
      afterSequence: null,
      afterRecordId: '',
      bootstrap: true,
      limit: 100,
    })

    await pullChanges(context(db), { deviceId: DEVICE_ID, cursor: response.cursor, limit: 50 })
    expect(db.pullChanges).toHaveBeenLastCalledWith(expect.objectContaining({
      afterSequence: '42', afterRecordId: 'task-a', limit: 50,
    }))
  })

  it.each([
    '',
    'v1.not-base64.not-base64',
    'v2.aaaa.bbbb',
    'v1.aaaa.bbbb.extra',
    'x'.repeat(513),
  ])('rejects malformed or forged opaque cursor %j before database access', async (cursor) => {
    const db = database()
    await expect(pullChanges(context(db), {
      deviceId: DEVICE_ID, cursor, limit: 100,
    })).rejects.toMatchObject({ status: 422, code: 'CURSOR_INVALID' })
    expect(db.pullChanges).not.toHaveBeenCalled()
  })

  it('defends the service boundary against oversized pages', async () => {
    const db = database()
    await expect(pullChanges(context(db), {
      deviceId: DEVICE_ID, limit: 501,
    })).rejects.toMatchObject({ status: 422, code: 'PAGE_LIMIT_INVALID' })
    expect(db.pullChanges).not.toHaveBeenCalled()
  })

  it('preserves tombstones and keeps the cursor stable for an empty page', async () => {
    const tombstone = record({ data: null, deletedAt: '2026-10-14T05:00:00.000Z' })
    const firstDb = database({ pullChanges: async () => ({
      records: [tombstone], nextSequence: '50', nextRecordId: 'task-a', hasMore: false,
    }) })
    const first = await pullChanges(context(firstDb), { deviceId: DEVICE_ID, limit: 100 })
    expect(first.records).toEqual([tombstone])

    const emptyDb = database({ pullChanges: async () => ({
      records: [], nextSequence: '50', nextRecordId: 'task-a', hasMore: false,
    }) })
    const empty = await pullChanges(context(emptyDb), {
      deviceId: DEVICE_ID, cursor: first.cursor, limit: 100,
    })
    expect(empty).toEqual({ records: [], cursor: first.cursor, hasMore: false })
  })

  it.each([
    ['CURSOR_EXPIRED', 410, 'CURSOR_EXPIRED'],
    ['DEVICE_UNKNOWN', 403, 'DEVICE_UNKNOWN'],
    ['DEVICE_REVOKED', 403, 'DEVICE_REVOKED'],
  ])('maps %s without leaking database errors', async (databaseCode, status, apiCode) => {
    const db = database({ pullChanges: async () => { throw new DatabaseFailure(databaseCode) } })
    await expect(pullChanges(context(db), {
      deviceId: DEVICE_ID, limit: 100,
    })).rejects.toMatchObject({ status, code: apiCode })
  })
})
