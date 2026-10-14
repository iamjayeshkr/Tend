import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it } from 'vitest'

import type { TendIdentity } from '../auth/types'
import { defaultState } from '../core'
import type { SyncOperation } from '../sync/types'
import { LocalRepository } from './localRepository'
import { WorkspaceManager } from './workspaceManager'

const signedIn = (userId: string): TendIdentity => ({
  status: 'signedIn', cloudAvailable: true, userId,
  getAccessToken: async () => 'token', signOut: async () => undefined,
})

async function preparedManager() {
  const repository = await LocalRepository.open({ indexedDB: new IDBFactory() })
  const guest = defaultState(); guest.settings.name = 'Guest'
  const accountA = defaultState(); accountA.settings.name = 'Account A'
  const accountB = defaultState(); accountB.settings.name = 'Account B'
  await repository.commit('guest', null, guest, [])
  await repository.commit('account:user_a', null, accountA, [])
  await repository.commit('account:user_b', null, accountB, [])
  return { repository, manager: new WorkspaceManager(repository) }
}

describe('WorkspaceManager', () => {
  it('loads only the workspace named by a verified identity', async () => {
    const { manager, repository } = await preparedManager()

    const selection = await manager.select(signedIn('user_a'))
    expect(selection).toMatchObject({ kind: 'account', workspaceId: 'account:user_a', ownerId: 'user_a' })
    expect(selection.kind === 'account' && selection.state.settings.name).toBe('Account A')
    expect(selection.kind === 'account' && selection.state.settings.name).not.toBe('Guest')
    expect(selection.kind === 'account' && selection.state.settings.name).not.toBe('Account B')
    repository.close()
  })

  it('locks an expired same-user session without exposing its cached state', async () => {
    const { manager, repository } = await preparedManager()
    await manager.select(signedIn('user_a'))
    manager.lockAccount('user_a')

    const selection = await manager.select({ status: 'locked', cloudAvailable: true, userId: 'user_a' })
    expect(selection).toEqual({ kind: 'locked', workspaceId: 'account:user_a', ownerId: 'user_a', reason: 'session-expired' })
    expect(selection).not.toHaveProperty('state')
    repository.close()
  })

  it('treats a fresh signed-out session as guest without consulting account data', async () => {
    const { manager, repository } = await preparedManager()
    const selection = await manager.select({ status: 'locked', cloudAvailable: true })

    expect(selection).toMatchObject({ kind: 'guest', workspaceId: 'guest' })
    expect(selection.kind === 'guest' && selection.state.settings.name).toBe('Guest')
    repository.close()
  })

  it('requires sync or export before signing out with pending operations', async () => {
    const { manager, repository } = await preparedManager()
    const pending: SyncOperation = {
      operationId: '00000000-0000-4000-8000-000000000001',
      collection: 'tasks', recordId: 'task-one', kind: 'delete', baseRevision: 1,
      changedAt: '2026-10-14T04:30:00.000Z',
    }
    const current = await repository.loadWorkspace('account:user_a')
    await repository.commit('account:user_a', current, current!, [pending])

    await expect(manager.prepareSignOut('user_a')).resolves.toEqual({ status: 'requiresSyncOrExport', pendingCount: 1 })
    await expect(manager.prepareSignOut('user_b')).resolves.toEqual({ status: 'ready' })
    repository.close()
  })
})
