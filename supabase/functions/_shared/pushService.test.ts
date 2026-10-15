import { describe, expect, it, vi } from 'vitest'

import { ApiFailure } from './http'
import { DatabaseFailure, type SyncDatabase } from './database'
import {
  pushOperations,
  registerDevice,
  validateMigration,
  type PushServiceContext,
} from './pushService'
import type { DeviceRegistration, PushResponse, SyncOperation } from '../../../src/sync/types'

const DEVICE_ID = '8db46216-8f06-4d87-a240-15f153c783b4'
const OWNER_ID = 'user_verified'

function operation(index: number, overrides: Partial<SyncOperation> = {}): SyncOperation {
  return {
    operationId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    collection: 'tasks',
    recordId: `task-${index}`,
    kind: 'put',
    baseRevision: 0,
    changedAt: '2026-10-14T04:30:00.000Z',
    data: { title: `Task ${index}`, done: false, date: '2026-10-14', category: 'work' },
    ...overrides,
  }
}

function database(overrides: Partial<SyncDatabase> = {}): SyncDatabase {
  return {
    registerDevice: vi.fn(async () => ({ status: 'registered' as const })),
    validateMigration: vi.fn(async ({ operations }) => ({
      accepted: true, recordCount: operations.length, conflicts: [],
    })),
    applyPush: vi.fn(async ({ operations }: Parameters<SyncDatabase['applyPush']>[0]) => ({
      results: operations.map((item, index) => ({
        operationId: item.operationId, status: 'applied' as const, revision: index + 1,
      })),
    })),
    ...overrides,
  }
}

function context(db = database()): PushServiceContext {
  return {
    principal: {
      ownerId: OWNER_ID,
      sessionId: 'session_verified',
      requestId: 'request-123',
      factorVerificationAge: null,
    },
    database: db,
  }
}

describe('device registration and migration validation', () => {
  it('registers only user-visible device metadata and never accepts hardware identifiers', async () => {
    const db = database()
    const registration: DeviceRegistration & Record<string, unknown> = {
      deviceId: DEVICE_ID,
      name: 'Rudra’s Mac',
      platform: 'desktop',
      appVersion: '1.1.14',
      hardwareId: 'must-not-cross-boundary',
      advertisingId: 'must-not-cross-boundary',
    }
    await expect(registerDevice(context(db), registration)).resolves.toEqual({ status: 'registered' })
    expect(db.registerDevice).toHaveBeenCalledWith({
      ownerId: OWNER_ID,
      deviceId: DEVICE_ID,
      displayName: 'Rudra’s Mac',
      platform: 'desktop',
      appVersion: '1.1.14',
    })
    expect(JSON.stringify(vi.mocked(db.registerDevice).mock.calls)).not.toContain('hardware')
    expect(JSON.stringify(vi.mocked(db.registerDevice).mock.calls)).not.toContain('advertising')
  })

  it('validates migration batches without calling the mutation path', async () => {
    const db = database()
    await expect(validateMigration(context(db), {
      deviceId: DEVICE_ID, dryRun: true, operations: [operation(1)],
    })).resolves.toEqual({ accepted: true, recordCount: 1, conflicts: [] })
    expect(db.validateMigration).toHaveBeenCalledOnce()
    expect(db.applyPush).not.toHaveBeenCalled()
  })
})

describe('pushOperations', () => {
  it.each([
    ['DEVICE_UNKNOWN', 'DEVICE_UNKNOWN'],
    ['DEVICE_REVOKED', 'DEVICE_REVOKED'],
  ])('maps %s to a safe 403', async (databaseCode, apiCode) => {
    const db = database({ applyPush: async () => { throw new DatabaseFailure(databaseCode) } })
    const promise = pushOperations(context(db), { deviceId: DEVICE_ID, operations: [operation(1)] })
    await expect(promise).rejects.toMatchObject({ status: 403, code: apiCode })
    await expect(promise).rejects.not.toHaveProperty('message', expect.stringContaining('SQL'))
  })

  it.each([
    ['IDEMPOTENCY_MISMATCH', 422, 'IDEMPOTENCY_MISMATCH'],
    ['IDEMPOTENCY_IN_FLIGHT', 409, 'IDEMPOTENCY_IN_FLIGHT'],
  ])('maps %s without exposing database details', async (databaseCode, status, apiCode) => {
    const db = database({ applyPush: async () => { throw new DatabaseFailure(databaseCode) } })
    await expect(pushOperations(context(db), {
      deviceId: DEVICE_ID, operations: [operation(1)],
    })).rejects.toMatchObject({ status, code: apiCode })
  })

  it('returns an identical completed replay as a stable duplicate result', async () => {
    const replay: PushResponse = {
      results: [{ operationId: operation(1).operationId, status: 'duplicate', revision: 4 }],
    }
    const db = database({ applyPush: vi.fn(async () => replay) })
    await expect(pushOperations(context(db), {
      deviceId: DEVICE_ID, operations: [operation(1)],
    })).resolves.toEqual(replay)
  })

  it('sorts records deterministically, strips owner input, and replaces client hashes', async () => {
    const db = database()
    const injected = {
      ...operation(2, { recordId: 'z-last', requestHash: 'f'.repeat(64) }),
      ownerId: 'user_attacker',
    } as SyncOperation
    await pushOperations(context(db), {
      deviceId: DEVICE_ID,
      operations: [injected, operation(1, { recordId: 'a-first', requestHash: 'e'.repeat(64) })],
    })

    const call = vi.mocked(db.applyPush).mock.calls[0]![0]
    expect(call.ownerId).toBe(OWNER_ID)
    expect(call.operations.map((item) => item.recordId)).toEqual(['a-first', 'z-last'])
    expect(call.operations.every((item) => /^[a-f0-9]{64}$/.test(item.requestHash))).toBe(true)
    expect(call.operations.map((item) => item.requestHash)).not.toContain('e'.repeat(64))
    expect(call.operations.map((item) => item.requestHash)).not.toContain('f'.repeat(64))
    expect(JSON.stringify(call.operations)).not.toContain('user_attacker')
  })

  it('defends the service boundary against batches above 100 operations', async () => {
    const db = database()
    const error = await pushOperations(context(db), {
      deviceId: DEVICE_ID,
      operations: Array.from({ length: 101 }, (_, index) => operation(index + 1)),
    }).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(ApiFailure)
    expect(error).toMatchObject({ status: 413, code: 'BATCH_TOO_LARGE' })
    expect(db.applyPush).not.toHaveBeenCalled()
  })
})
