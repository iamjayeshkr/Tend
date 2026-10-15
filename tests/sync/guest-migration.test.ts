import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it, vi } from 'vitest'

import type { TendIdentity } from '../../src/auth/types'
import { runGuestMigration } from '../../src/auth/guestMigration'
import { defaultState } from '../../src/core'
import { LocalRepository } from '../../src/data/localRepository'
import type { SyncGateway } from '../../src/sync/gatewayClient'
import { SyncEngine } from '../../src/sync/syncEngine'
import type { PushResponse, RemoteRecord, SyncOperation } from '../../src/sync/types'

const workspaceId = 'account:user_a'
const deviceId = '00000000-0000-4000-8000-000000000611'
const taskId = 'shared-task'
const changedAt = '2026-10-15T05:00:00.000Z'
const signedIn: TendIdentity = {
  status: 'signedIn', cloudAvailable: true, userId: 'user_a',
  getAccessToken: async () => 'token', signOut: async () => undefined,
}

describe('guest migration conflict recovery', () => {
  it('verifies migrated content through a durable conflict without replacing the guest', async () => {
    const repository = await LocalRepository.open({ indexedDB: new IDBFactory() })
    const account = defaultState(); account.routine = []
    account.tasks = [
      { id: taskId, title: 'Account title', done: false, date: '2026-10-15', category: 'work' },
      { id: 'account-only', title: 'Keep this', done: true, date: '2026-10-14', category: 'life' },
    ]
    const guest = structuredClone(account)
    guest.settings.parentalPin = 'guest-only-pin'
    guest.tasks = [{ ...guest.tasks[0]!, title: 'Guest title' }]
    await repository.commit('guest', null, guest, [])
    await repository.commit(workspaceId, null, account, [])
    const base: RemoteRecord = {
      collection: 'tasks', recordId: taskId, revision: 1, modifiedAt: changedAt, deletedAt: null,
      data: { title: 'Account title', done: false, date: '2026-10-15', category: 'work' },
    }
    await repository.acknowledge(workspaceId, {
      operationIds: [], revisions: { [`tasks:${taskId}`]: 1 }, baseRecords: [base],
    }, 'cursor-1')
    const remote: RemoteRecord = {
      ...base, revision: 2,
      data: { ...base.data!, title: 'Cloud title' },
    }
    const push = vi.fn(async ({ operations }: { operations: SyncOperation[] }): Promise<PushResponse> => ({
      results: operations.map((operation) => ({
        operationId: operation.operationId, status: 'conflict' as const,
        conflictId: '00000000-0000-4000-8000-000000000612', record: remote,
      })),
    }))
    const gateway: SyncGateway = {
      registerDevice: vi.fn(async () => ({ status: 'active' as const })),
      validateMigration: vi.fn(async ({ operations }) => ({ accepted: true, recordCount: operations.length, conflicts: [] })),
      push,
      pull: vi.fn(async ({ cursor }) => ({ records: [], cursor: cursor ?? 'cursor-1', hasMore: false })),
    }
    const engine = new SyncEngine({
      identity: signedIn, workspaceId, deviceId, repository, gateway,
      network: { isOnline: () => true, subscribe: () => () => undefined },
    })

    const result = await runGuestMigration({
      guestState: guest, workspaceId, deviceId, repository, gateway,
      synchronize: () => engine.syncNow(),
      migrationId: () => '00000000-0000-4000-8000-000000000613',
      now: () => Date.parse(changedAt),
    })

    expect(result).toMatchObject({ status: 'complete', verifiedRecordCount: expect.any(Number) })
    expect((await repository.loadWorkspace(workspaceId))?.tasks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: taskId, title: 'Cloud title' }),
      expect.objectContaining({ id: 'account-only', title: 'Keep this' }),
    ]))
    expect((await repository.loadMetadata(workspaceId)).conflicts).toEqual([
      expect.objectContaining({
        reason: 'same-field-change',
        local: expect.objectContaining({ data: expect.objectContaining({ title: 'Guest title' }) }),
      }),
    ])
    expect(await repository.loadWorkspace('guest')).toEqual(guest)
    expect(JSON.stringify(await repository.loadMetadata(workspaceId))).not.toContain('guest-only-pin')
    repository.close()
  })
})
