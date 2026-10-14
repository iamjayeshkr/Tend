import { describe, expect, it } from 'vitest'

import {
  TEND_COLLECTIONS,
  canonicalOperation,
  parsePullResponse,
  parsePushRequest,
  parseRemoteRecord,
} from './schemas'
import type { JsonValue, SyncOperation, TendCollection } from './types'

const DEVICE_ID = '8db46216-8f06-4d87-a240-15f153c783b4'
const OPERATION_ID = 'e5e5657e-5c83-4c93-8203-ae263fa6916c'

const payloads: Record<TendCollection, { recordId: string; data: Record<string, JsonValue> }> = {
  tasks: { recordId: 'task-legacy', data: { title: 'Read', done: false, date: '2026-10-14', category: 'study' } },
  routine: { recordId: 'routine-morning', data: { title: 'Morning', start: '06:30', end: '08:00', category: 'life' } },
  activities: { recordId: 'activity-focus', data: { title: 'Read', category: 'study', start: 1, end: 2, createdAt: 1, modifiedAt: 2, source: 'timer' } },
  ideas: { recordId: 'idea-one', data: { text: 'A note', kind: 'idea', status: 'unexplored', createdAt: 1 } },
  reviews: { recordId: '2026-10-14', data: { mood: 4, win: 'Shipped', lesson: 'Test', tomorrow: 'Rest' } },
  sets: { recordId: 'set-one', data: { exercise: 'Squat', weight: 20, reps: 10, createdAt: 1 } },
  wakeLogs: { recordId: '2026-10-14', data: { timestamp: 1 } },
  sleepLogs: { recordId: '2026-10-14', data: { timestamp: 2 } },
  settings: { recordId: 'focusMinutes', data: { value: 25 } },
}

function operation(collection: TendCollection = 'tasks'): SyncOperation {
  const payload = payloads[collection]
  return {
    operationId: OPERATION_ID,
    collection,
    recordId: payload.recordId,
    kind: 'put',
    baseRevision: 0,
    changedAt: '2026-10-14T04:30:00.000Z',
    data: payload.data,
    requestHash: 'a'.repeat(64),
  }
}

describe('sync protocol boundary', () => {
  it('accepts exactly the nine allowlisted collections', () => {
    expect(TEND_COLLECTIONS).toEqual([
      'tasks', 'routine', 'activities', 'ideas', 'reviews', 'sets', 'wakeLogs', 'sleepLogs', 'settings',
    ])
    for (const collection of TEND_COLLECTIONS) {
      const parsed = parsePushRequest({ deviceId: DEVICE_ID, operations: [operation(collection)] })
      expect(parsed.operations[0]?.collection).toBe(collection)
    }
  })

  it('rejects more than 100 operations and unknown fields', () => {
    expect(() => parsePushRequest({ deviceId: DEVICE_ID, operations: Array.from({ length: 101 }, () => operation()) })).toThrow(/100/)
    expect(() => parsePushRequest({ deviceId: DEVICE_ID, operations: [], ownerId: 'attacker-controlled' })).toThrow(/unrecognized|unknown/i)
    expect(() => parsePushRequest({ deviceId: DEVICE_ID, operations: [{ ...operation(), ownerId: 'user_other' }] })).toThrow(/unrecognized|unknown/i)
  })

  it('validates UUIDs, calendar dates, timestamps, and revisions', () => {
    expect(() => parsePushRequest({ deviceId: 'not-a-uuid', operations: [] })).toThrow(/uuid/i)
    expect(() => parsePushRequest({ deviceId: DEVICE_ID, operations: [{ ...operation(), operationId: 'not-a-uuid' }] })).toThrow(/uuid/i)
    expect(() => parsePushRequest({ deviceId: DEVICE_ID, operations: [{ ...operation(), baseRevision: -1 }] })).toThrow(/revision|greater/i)
    expect(() => parsePushRequest({ deviceId: DEVICE_ID, operations: [{ ...operation(), changedAt: 'yesterday' }] })).toThrow(/date|time/i)
    expect(() => parsePushRequest({ deviceId: DEVICE_ID, operations: [{ ...operation('reviews'), recordId: '2026-02-30' }] })).toThrow(/date/i)
  })

  it('enforces a structural depth limit before schema parsing', () => {
    let nested: Record<string, unknown> = { value: 'bottom' }
    for (let index = 0; index < 12; index += 1) nested = { child: nested }
    expect(() => parsePushRequest({ deviceId: DEVICE_ID, operations: [{ ...operation(), data: nested }] })).toThrow(/nesting is too deep/i)
  })

  it('rejects device-private settings', () => {
    for (const recordId of ['parentalPin', 'restrictedPackages', 'notifications', 'wakeLockEnabled']) {
      expect(() => parsePushRequest({
        deviceId: DEVICE_ID,
        operations: [{ ...operation('settings'), recordId, data: { value: true } }],
      })).toThrow(/setting/i)
    }
  })

  it('validates remote records and pull response envelopes', () => {
    const record = parseRemoteRecord({
      collection: 'tasks', recordId: 'task-legacy', revision: 1,
      modifiedAt: '2026-10-14T04:30:00.000Z', deletedAt: null,
      data: payloads.tasks.data,
    })
    expect(record.revision).toBe(1)
    expect(parsePullResponse({ records: [record], cursor: 'v1:opaque', hasMore: false })).toEqual({ records: [record], cursor: 'v1:opaque', hasMore: false })
    expect(() => parseRemoteRecord({ ...record, revision: 1.5 })).toThrow(/integer/i)
  })
})

describe('canonicalOperation', () => {
  it('sorts object keys recursively and excludes transport-only fields', () => {
    const first = operation()
    first.data = { done: false, title: 'Read', category: 'study', date: '2026-10-14' }
    const second = { ...first, data: { date: '2026-10-14', category: 'study', title: 'Read', done: false }, requestHash: 'b'.repeat(64) }

    expect(canonicalOperation(first)).toBe(canonicalOperation(second))
    expect(canonicalOperation(first)).not.toContain('requestHash')
    expect(canonicalOperation(first)).toBe('{"baseRevision":0,"changedAt":"2026-10-14T04:30:00.000Z","collection":"tasks","data":{"category":"study","date":"2026-10-14","done":false,"title":"Read"},"kind":"put","operationId":"e5e5657e-5c83-4c93-8203-ae263fa6916c","recordId":"task-legacy"}')
  })
})
