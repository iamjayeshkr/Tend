import { describe, expect, it, vi } from 'vitest'

import {
  NINETY_DAYS_MS,
  THIRTY_DAYS_MS,
  purgeExpiredData,
  type RetentionDatabase,
} from './retentionService.ts'
import { ApiFailure } from './http.ts'

function mockDb(overrides: Partial<RetentionDatabase> = {}): RetentionDatabase {
  return {
    advanceRetentionFloorBeforePurge: vi.fn(async () => 3),
    purgeExpiredTombstones: vi.fn(async () => 42),
    purgeExpiredOperations: vi.fn(async () => 18),
    purgeExpiredConflicts: vi.fn(async () => 4),
    purgeExpiredSecurityEvents: vi.fn(async () => 7),
    ...overrides,
  }
}

describe('retentionService', () => {
  const FIXED_NOW = 1700000000000

  it('rejects execution when scheduler secret is missing or invalid', async () => {
    const db = mockDb()
    await expect(
      purgeExpiredData(db, { schedulerSecret: 'super-secret-token', providedSecret: 'wrong' }),
    ).rejects.toThrow(ApiFailure)

    await expect(
      purgeExpiredData(db, { schedulerSecret: 'super-secret-token' }),
    ).rejects.toThrow(ApiFailure)

    expect(db.purgeExpiredTombstones).not.toHaveBeenCalled()
  })

  it('advances retention floors before purging tombstones and purges within exact cutoff boundaries', async () => {
    const db = mockDb()
    const summary = await purgeExpiredData(db, {
      now: FIXED_NOW,
      schedulerSecret: 'token_123',
      providedSecret: 'token_123',
      batchLimit: 500,
    })

    const expectedTombstoneCutoff = new Date(FIXED_NOW - THIRTY_DAYS_MS).toISOString()
    const expectedCurrentCutoff = new Date(FIXED_NOW).toISOString()

    expect(db.advanceRetentionFloorBeforePurge).toHaveBeenCalledWith(expectedTombstoneCutoff)
    expect(db.purgeExpiredTombstones).toHaveBeenCalledWith(expectedTombstoneCutoff, 500)
    expect(db.purgeExpiredOperations).toHaveBeenCalledWith(expectedCurrentCutoff, 500)
    expect(db.purgeExpiredConflicts).toHaveBeenCalledWith(expectedCurrentCutoff, 500)
    expect(db.purgeExpiredSecurityEvents).toHaveBeenCalledWith(expectedCurrentCutoff, 500)

    expect(summary.purgedTombstones).toBe(42)
    expect(summary.purgedOperations).toBe(18)
    expect(summary.purgedConflicts).toBe(4)
    expect(summary.purgedSecurityEvents).toBe(7)
    expect(summary.retentionFloorsAdvanced).toBe(3)
  })

  it('is idempotent on repeated runs and handles zero purges cleanly', async () => {
    const db = mockDb({
      advanceRetentionFloorBeforePurge: vi.fn(async () => 0),
      purgeExpiredTombstones: vi.fn(async () => 0),
      purgeExpiredOperations: vi.fn(async () => 0),
      purgeExpiredConflicts: vi.fn(async () => 0),
      purgeExpiredSecurityEvents: vi.fn(async () => 0),
    })

    const summary = await purgeExpiredData(db, { now: FIXED_NOW })
    expect(summary.purgedTombstones).toBe(0)
    expect(summary.purgedOperations).toBe(0)
    expect(summary.purgedConflicts).toBe(0)
    expect(summary.purgedSecurityEvents).toBe(0)
    expect(summary.retentionFloorsAdvanced).toBe(0)
  })
})
