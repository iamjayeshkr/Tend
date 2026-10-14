import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it } from 'vitest'

import { defaultState, type AppState } from '../core'
import type { SyncOperation } from '../sync/types'
import { LocalRepository } from './localRepository'

const changedAt = '2026-10-14T04:30:00.000Z'
const operation = (operationId = '00000000-0000-4000-8000-000000000001'): SyncOperation => ({
  operationId,
  collection: 'tasks',
  recordId: 'task-one',
  kind: 'put',
  baseRevision: 0,
  changedAt,
  data: { title: 'One', done: false, date: '2026-10-14', category: 'study' },
})

async function createLegacyDatabase(factory: IDBFactory, raw: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = factory.open('tend', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('snapshots')
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const database = request.result
      const transaction = database.transaction('snapshots', 'readwrite')
      transaction.objectStore('snapshots').put(raw, 'tend.state.v1')
      transaction.oncomplete = () => { database.close(); resolve() }
      transaction.onerror = () => reject(transaction.error)
    }
  })
}

function memoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() { return values.size },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key) },
    setItem: (key, value) => { values.set(key, value) },
  }
}

describe('LocalRepository', () => {
  it('migrates the byte-identical v1 snapshot to guest exactly once', async () => {
    const indexedDB = new IDBFactory()
    const state = defaultState()
    state.settings.name = 'Legacy guest'
    const raw = JSON.stringify(state)
    await createLegacyDatabase(indexedDB, raw)

    const first = await LocalRepository.open({ indexedDB })
    expect(await first.loadWorkspace('guest')).toEqual(state)
    expect(await first.readLegacySnapshot()).toBe(raw)
    const updated = structuredClone(state)
    updated.settings.name = 'Current guest'
    await first.commit('guest', state, updated, [])
    first.close()

    const reopened = await LocalRepository.open({ indexedDB })
    expect((await reopened.loadWorkspace('guest'))?.settings.name).toBe('Current guest')
    expect(await reopened.readLegacySnapshot()).toBe(raw)
    reopened.close()
  })

  it('commits snapshot and queue atomically and aborts both on a stale snapshot', async () => {
    const repository = await LocalRepository.open({ indexedDB: new IDBFactory() })
    const initial = defaultState()
    const first = structuredClone(initial)
    first.settings.name = 'First'
    await repository.commit('guest', null, first, [operation()])
    expect(await repository.loadWorkspace('guest')).toEqual(first)
    expect(await repository.readPending('guest', 10)).toEqual([operation()])

    const staleNext = structuredClone(initial)
    staleNext.settings.name = 'Must not commit'
    await expect(repository.commit('guest', initial, staleNext, [operation('00000000-0000-4000-8000-000000000002')])).rejects.toThrow(/changed in another writer/i)
    expect(await repository.loadWorkspace('guest')).toEqual(first)
    expect(await repository.readPending('guest', 10)).toEqual([operation()])
    repository.close()
  })

  it('serializes writes in call order', async () => {
    const repository = await LocalRepository.open({ indexedDB: new IDBFactory() })
    const first = defaultState()
    first.settings.name = 'First'
    const second = structuredClone(first)
    second.settings.name = 'Second'

    const firstWrite = repository.commit('guest', null, first, [])
    const secondWrite = repository.commit('guest', first, second, [])
    await Promise.all([firstWrite, secondWrite])

    expect((await repository.loadWorkspace('guest'))?.settings.name).toBe('Second')
    repository.close()
  })

  it('acknowledges operations and the pull cursor in one transaction', async () => {
    const repository = await LocalRepository.open({ indexedDB: new IDBFactory() })
    const state = defaultState()
    await repository.commit('account:user_a', null, state, [operation()])
    await repository.acknowledge('account:user_a', { operationIds: [operation().operationId] }, 'cursor-one')

    expect(await repository.readPending('account:user_a', 10)).toEqual([])
    expect(await repository.loadMetadata('account:user_a')).toMatchObject({ pullCursor: 'cursor-one' })
    repository.close()
  })

  it('stores a recovery snapshot and deletes only the selected workspace', async () => {
    const repository = await LocalRepository.open({ indexedDB: new IDBFactory() })
    const guest = defaultState()
    const account = structuredClone(guest)
    account.settings.name = 'Account'
    await repository.commit('guest', null, guest, [])
    await repository.commit('account:user_a', null, account, [operation()])
    await repository.saveRecoverySnapshot('account:user_a', account)

    expect(await repository.loadRecoverySnapshot('account:user_a')).toEqual(account)
    await repository.deleteWorkspace('account:user_a')
    expect(await repository.loadWorkspace('account:user_a')).toBeNull()
    expect(await repository.readPending('account:user_a', 10)).toEqual([])
    expect(await repository.loadWorkspace('guest')).toEqual(guest)
    repository.close()
  })

  it('exposes guest-only capability through the localStorage fallback', async () => {
    const repository = await LocalRepository.open({ indexedDB: undefined, localStorage: memoryStorage() })
    expect(repository.capabilities).toEqual({ accountWorkspaces: false, durableQueue: false, recoverySnapshots: false })
    const guest = defaultState()
    await repository.commit('guest', null, guest, [])
    expect(await repository.loadWorkspace('guest')).toEqual(guest)
    await expect(repository.loadWorkspace('account:user_a')).rejects.toThrow(/guest only/i)
    await expect(repository.commit('guest', guest, guest, [operation()])).rejects.toThrow(/durable queue/i)
  })
})
