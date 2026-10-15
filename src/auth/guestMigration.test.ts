import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it, vi } from 'vitest'

import { defaultState } from '../core'
import { LocalRepository } from '../data/localRepository'
import { GatewayError, type SyncGateway } from '../sync/gatewayClient'
import type { SyncOperation } from '../sync/types'
import { schema1ActiveTimerState, schema1CompleteState } from '../test-fixtures/schema1'
import {
  RECOVERY_RETENTION_MS,
  previewGuestMigration,
  resumeGuestMigration,
  runGuestMigration,
} from './guestMigration'

const workspaceId = 'account:user_a'
const deviceId = '00000000-0000-4000-8000-000000000601'
const migrationId = '00000000-0000-4000-8000-000000000602'

function gateway(validateMigration: SyncGateway['validateMigration']): SyncGateway {
  return {
    registerDevice: vi.fn(async () => ({ status: 'active' as const })),
    validateMigration,
    push: vi.fn(async () => ({ results: [] })),
    pull: vi.fn(async () => ({ records: [], cursor: 'cursor-1', hasMore: false })),
  }
}

async function acknowledgeAll(repository: LocalRepository): Promise<void> {
  const operations = await repository.readPending(workspaceId, 1_000)
  await repository.acknowledge(workspaceId, {
    operationIds: operations.map(({ operationId }) => operationId),
    revisions: Object.fromEntries(operations.map((operation) => [
      `${operation.collection}:${operation.recordId}`, operation.baseRevision + 1,
    ])),
  })
}

describe('guest migration preview', () => {
  it('counts every shareable collection and names device-only exclusions', () => {
    const preview = previewGuestMigration(schema1ActiveTimerState())
    expect(preview.counts).toEqual({
      tasks: 2, routine: 2, activities: 2, ideas: 2, reviews: 1,
      sets: 1, wakeLogs: 1, sleepLogs: 1, settings: 9,
    })
    expect(preview.totalRecords).toBe(21)
    expect(preview.excluded.activeTimer).toBe(true)
    expect(preview.excluded.settingKeys).toEqual(expect.arrayContaining([
      'parentalPin', 'restrictedPackages', 'notifications', 'appLimits',
    ]))
  })
})

describe('runGuestMigration', () => {
  it('dry-runs before local mutation and reuses its durable ids after a validation retry', async () => {
    const now = 1_797_000_000_000
    const repository = await LocalRepository.open({ indexedDB: new IDBFactory() })
    const guest = schema1CompleteState()
    const account = defaultState()
    account.routine = []
    account.settings.parentalPin = 'account-only-pin'
    await repository.commit('guest', null, guest, [])
    await repository.commit(workspaceId, null, account, [])

    const validated: SyncOperation[][] = []
    const validateMigration = vi.fn(async ({ operations }: { operations: SyncOperation[] }) => {
      validated.push(structuredClone(operations))
      expect(await repository.loadWorkspace(workspaceId)).toEqual(account)
      expect(await repository.readPending(workspaceId, 1_000)).toEqual([])
      if (validated.length === 1) throw new GatewayError({ status: 503, code: 'SYNC_UNAVAILABLE', retryable: true })
      return { accepted: true, recordCount: operations.length, conflicts: [] }
    })
    const dependencies = {
      guestState: guest,
      workspaceId,
      deviceId,
      repository,
      gateway: gateway(validateMigration),
      synchronize: () => acknowledgeAll(repository),
      migrationId: () => migrationId,
      now: () => now,
    }

    await expect(runGuestMigration(dependencies)).rejects.toMatchObject({ code: 'SYNC_UNAVAILABLE' })
    expect(await repository.loadWorkspace('guest')).toEqual(guest)
    expect(await repository.loadWorkspace(workspaceId)).toEqual(account)

    const result = await runGuestMigration(dependencies)
    expect(result).toMatchObject({ status: 'complete', migrationId, verifiedRecordCount: 21 })
    expect(validated).toHaveLength(2)
    expect(validated[1]!.map(({ operationId }) => operationId)).toEqual(
      validated[0]!.map(({ operationId }) => operationId),
    )
    expect(new Set(validated[1]!.map(({ operationId }) => operationId)).size).toBe(validated[1]!.length)
    expect(JSON.stringify(validated[1])).not.toContain('account-only-pin')
    expect(JSON.stringify(validated[1])).not.toContain(guest.settings.parentalPin)
    expect((await repository.loadWorkspace(workspaceId))?.settings.parentalPin).toBe('account-only-pin')
    expect((await repository.loadMetadata(workspaceId)).migration).toMatchObject({ migrationId, status: 'complete' })
    expect(await repository.loadRecoverySnapshot(workspaceId, now + RECOVERY_RETENTION_MS - 1)).toEqual(guest)
    expect(await repository.loadRecoverySnapshot(workspaceId, now + RECOVERY_RETENTION_MS)).toBeNull()
    expect(await repository.loadWorkspace('guest')).toEqual(guest)
    repository.close()
  })

  it('resumes the durable queue without revalidating or changing operation ids', async () => {
    const repository = await LocalRepository.open({ indexedDB: new IDBFactory() })
    const guest = schema1CompleteState()
    const account = defaultState(); account.routine = []
    await repository.commit('guest', null, guest, [])
    await repository.commit(workspaceId, null, account, [])
    const validateMigration = vi.fn(async ({ operations }: { operations: SyncOperation[] }) => ({
      accepted: true, recordCount: operations.length, conflicts: [],
    }))
    let attempts = 0
    let durableIds: string[] = []
    const synchronize = async () => {
      attempts += 1
      const pending = await repository.readPending(workspaceId, 1_000)
      if (attempts === 1) {
        durableIds = pending.map(({ operationId }) => operationId)
        throw new GatewayError({ status: 503, code: 'SYNC_UNAVAILABLE', retryable: true })
      }
      expect(pending.map(({ operationId }) => operationId)).toEqual(durableIds)
      await acknowledgeAll(repository)
    }

    await expect(runGuestMigration({
      guestState: guest, workspaceId, deviceId, repository, gateway: gateway(validateMigration),
      synchronize, migrationId: () => migrationId,
    })).rejects.toMatchObject({ code: 'SYNC_UNAVAILABLE' })
    expect(await repository.readPending(workspaceId, 1_000)).not.toHaveLength(0)

    const result = await resumeGuestMigration({ workspaceId, repository, synchronize })
    expect(result.status).toBe('complete')
    expect(validateMigration).toHaveBeenCalledOnce()
    expect(await repository.readPending(workspaceId, 1_000)).toEqual([])
    repository.close()
  })

  it('refuses completion when the pulled account no longer matches the migration fingerprints', async () => {
    const repository = await LocalRepository.open({ indexedDB: new IDBFactory() })
    const guest = schema1CompleteState()
    const account = defaultState(); account.routine = []
    await repository.commit('guest', null, guest, [])
    await repository.commit(workspaceId, null, account, [])
    const syncWrongState = async () => {
      const migrated = (await repository.loadWorkspace(workspaceId))!
      const wrong = structuredClone(migrated)
      wrong.tasks[0] = { ...wrong.tasks[0]!, title: 'Different cloud content' }
      await repository.commit(workspaceId, migrated, wrong, [])
      await acknowledgeAll(repository)
    }

    await expect(runGuestMigration({
      guestState: guest,
      workspaceId,
      deviceId,
      repository,
      gateway: gateway(async ({ operations }) => ({
        accepted: true, recordCount: operations.length, conflicts: [],
      })),
      synchronize: syncWrongState,
      migrationId: () => migrationId,
    })).rejects.toMatchObject({ code: 'MIGRATION_NOT_VERIFIED' })
    expect((await repository.loadMetadata(workspaceId)).migration?.status).toBe('prepared')
    expect(await repository.loadWorkspace('guest')).toEqual(guest)
    repository.close()
  })

  it('validates every bounded batch before it commits a large migration', async () => {
    const repository = await LocalRepository.open({ indexedDB: new IDBFactory() })
    const account = defaultState(); account.routine = []
    const guest = structuredClone(account)
    guest.tasks = Array.from({ length: 105 }, (_, index) => ({
      id: `task-${index}`, title: `Task ${index}`, done: false, date: '2026-10-15', category: 'work' as const,
    }))
    await repository.commit('guest', null, guest, [])
    await repository.commit(workspaceId, null, account, [])
    const batchSizes: number[] = []
    const validateMigration = vi.fn(async ({ operations }: { operations: SyncOperation[] }) => {
      batchSizes.push(operations.length)
      expect(await repository.loadWorkspace(workspaceId)).toEqual(account)
      expect(await repository.readPending(workspaceId, 1_000)).toEqual([])
      return { accepted: true, recordCount: operations.length, conflicts: [] }
    })

    const result = await runGuestMigration({
      guestState: guest,
      workspaceId,
      deviceId,
      repository,
      gateway: gateway(validateMigration),
      synchronize: () => acknowledgeAll(repository),
      migrationId: () => migrationId,
    })
    expect(batchSizes).toEqual([100, 5])
    expect(result.verifiedRecordCount).toBe(114)
    repository.close()
  })
})
