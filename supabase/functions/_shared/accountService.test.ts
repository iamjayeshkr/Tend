import { describe, expect, it, vi } from 'vitest'

import {
  exportAccountData,
  listDevices,
  revokeDevice,
  type AccountDatabase,
  type AccountServiceContext,
} from './accountService.ts'
import { ApiFailure } from './http.ts'

const OWNER_ID = 'user_account_test'
const DEVICE_1 = 'a0000000-0000-4000-8000-000000000001'
const DEVICE_2 = 'b0000000-0000-4000-8000-000000000002'

function mockDb(overrides: Partial<AccountDatabase> = {}): AccountDatabase {
  return {
    listDevices: vi.fn(async () => [
      {
        id: DEVICE_1,
        display_name: 'Desktop Web',
        platform: 'desktop' as const,
        app_version: '1.1.14',
        created_at: '2026-10-14T10:00:00Z',
        last_seen_at: '2026-10-15T07:00:00Z',
        revoked_at: null,
      },
      {
        id: DEVICE_2,
        display_name: 'Mobile Web',
        platform: 'web' as const,
        app_version: '1.1.14',
        created_at: '2026-10-13T10:00:00Z',
        last_seen_at: '2026-10-14T07:00:00Z',
        revoked_at: null,
      },
    ]),
    revokeDevice: vi.fn(async (_owner, deviceId) => deviceId === DEVICE_2),
    exportRecords: vi.fn(async () => [
      {
        collection: 'tasks',
        record_id: 'task-1',
        revision: 2,
        data: { title: 'Review PR', done: false, date: '2026-10-15', category: 'work' },
        modified_at: '2026-10-15T06:00:00Z',
      },
      {
        collection: 'ideas',
        record_id: 'idea-1',
        revision: 1,
        data: { title: 'Calm morning thoughts', body: 'Paper aesthetic rules', date: '2026-10-15' },
        modified_at: '2026-10-15T06:30:00Z',
      },
    ]),
    ...overrides,
  }
}

function context(db = mockDb(), currentDeviceId?: string): AccountServiceContext {
  return {
    principal: { ownerId: OWNER_ID, sessionId: 'sess_123', requestId: 'req_123' },
    currentDeviceId,
    database: db,
  }
}

describe('accountService', () => {
  it('lists devices with current device indicator and safe fields only', async () => {
    const ctx = context(mockDb(), DEVICE_1)
    const devices = await listDevices(ctx)

    expect(devices).toHaveLength(2)
    expect(devices[0].deviceId).toBe(DEVICE_1)
    expect(devices[0].isCurrentDevice).toBe(true)
    expect(devices[1].deviceId).toBe(DEVICE_2)
    expect(devices[1].isCurrentDevice).toBe(false)
  })

  it('revokes an existing device successfully', async () => {
    const db = mockDb()
    const ctx = context(db)
    const result = await revokeDevice(ctx, DEVICE_2)

    expect(result.success).toBe(true)
    expect(result.revokedDeviceId).toBe(DEVICE_2)
    expect(db.revokeDevice).toHaveBeenCalledWith(OWNER_ID, DEVICE_2)
  })

  it('rejects invalid or non-existent device revocation', async () => {
    const ctx = context(mockDb())
    await expect(revokeDevice(ctx, 'not-a-uuid')).rejects.toThrow(ApiFailure)
    await expect(revokeDevice(ctx, DEVICE_1)).rejects.toThrow(ApiFailure)
  })

  it('exports user records grouped by collection without credentials', async () => {
    const ctx = context(mockDb())
    const exportBundle = await exportAccountData(ctx)

    expect(exportBundle.version).toBe(1)
    expect(exportBundle.ownerId).toBe(OWNER_ID)
    expect(exportBundle.collections.tasks).toHaveLength(1)
    expect(exportBundle.collections.tasks[0].recordId).toBe('task-1')
    expect(exportBundle.collections.ideas).toHaveLength(1)
  })
})
