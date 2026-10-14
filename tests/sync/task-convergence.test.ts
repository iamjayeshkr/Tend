import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it, vi } from 'vitest'

import type { TendIdentity } from '../../src/auth/types'
import { defaultState, type AppState, type Task } from '../../src/core'
import { LocalRepository } from '../../src/data/localRepository'
import { GatewayError, type SyncGateway } from '../../src/sync/gatewayClient'
import { diffRecords, recordKey, stateToRecords } from '../../src/sync/recordAdapter'
import { SyncEngine, type SyncEngineNetwork, type SyncEngineScheduler } from '../../src/sync/syncEngine'
import type { DeviceRegistration, PullResponse, PushResponse, RemoteRecord, SyncOperation } from '../../src/sync/types'

const workspaceId = 'account:user_a'
const desktopId = '00000000-0000-4000-8000-000000000101'
const phoneId = '00000000-0000-4000-8000-000000000102'
const taskId = 'task-convergence'
const signedIn: TendIdentity = {
  status: 'signedIn', cloudAvailable: true, userId: 'user_a',
  getAccessToken: async () => 'token', signOut: async () => undefined,
}

class TestNetwork implements SyncEngineNetwork {
  private readonly listeners = new Set<() => void>()
  constructor(private online: boolean) {}
  isOnline() { return this.online }
  subscribe(listener: () => void) { this.listeners.add(listener); return () => this.listeners.delete(listener) }
  setOnline(online: boolean) { this.online = online; for (const listener of this.listeners) listener() }
}

class ManualScheduler implements SyncEngineScheduler {
  readonly callbacks: Array<() => void> = []
  setTimeout(callback: () => void) { this.callbacks.push(callback); return this.callbacks.length }
  clearTimeout() {}
  retryNext() { this.callbacks.shift()?.() }
}

class InMemoryGateway implements SyncGateway {
  readonly registrations = new Set<string>()
  readonly records = new Map<string, RemoteRecord>()
  readonly results = new Map<string, PushResponse['results'][number]>()
  private readonly changes: Array<{ sequence: number; record: RemoteRecord }> = []
  private sequence = 0
  failNextPushFor: string | null = null

  async registerDevice(registration: DeviceRegistration) {
    this.registrations.add(registration.deviceId)
    return { status: 'registered' as const }
  }
  async validateMigration() { return { accepted: true, recordCount: 0, conflicts: [] } }

  async push({ deviceId, operations }: { deviceId: string; operations: SyncOperation[] }): Promise<PushResponse> {
    if (!this.registrations.has(deviceId)) throw new GatewayError({ status: 403, code: 'DEVICE_UNKNOWN', retryable: false })
    if (this.failNextPushFor === deviceId) {
      this.failNextPushFor = null
      throw new GatewayError({ status: 503, code: 'SYNC_UNAVAILABLE', retryable: true })
    }
    const results: PushResponse['results'] = []
    for (const operation of operations) {
      const duplicate = this.results.get(operation.operationId)
      if (duplicate) { results.push(duplicate); continue }
      const key = recordKey(operation.collection, operation.recordId)
      const current = this.records.get(key)
      if ((current?.revision ?? 0) !== operation.baseRevision) {
        const conflict = {
          operationId: operation.operationId, status: 'conflict' as const,
          conflictId: crypto.randomUUID(), ...(current ? { record: current } : {}),
        }
        this.results.set(operation.operationId, conflict)
        results.push(conflict)
        continue
      }
      const revision = (current?.revision ?? 0) + 1
      const record: RemoteRecord = {
        collection: operation.collection,
        recordId: operation.recordId,
        revision,
        modifiedAt: operation.changedAt,
        deletedAt: operation.kind === 'delete' ? operation.changedAt : null,
        data: operation.kind === 'delete' ? null : operation.data!,
      }
      this.records.set(key, record)
      this.sequence += 1
      this.changes.push({ sequence: this.sequence, record: structuredClone(record) })
      const applied = { operationId: operation.operationId, status: 'applied' as const, revision, record }
      this.results.set(operation.operationId, applied)
      results.push(applied)
    }
    return { results }
  }

  async pull({ deviceId, cursor, limit }: { deviceId: string; cursor?: string; limit: number }): Promise<PullResponse> {
    if (!this.registrations.has(deviceId)) throw new GatewayError({ status: 403, code: 'DEVICE_UNKNOWN', retryable: false })
    const after = cursor ? Number(cursor.replace('cursor-', '')) : 0
    const page = this.changes.filter((change) => change.sequence > after).slice(0, limit)
    const next = page.at(-1)?.sequence ?? after
    return {
      records: page.map(({ record }) => structuredClone(record)),
      cursor: `cursor-${next}`,
      hasMore: this.changes.some((change) => change.sequence > next),
    }
  }
}

async function commitTasks(
  repository: LocalRepository,
  change: (tasks: Task[]) => Task[],
  operationId: string,
): Promise<AppState> {
  const previous = await repository.loadWorkspace(workspaceId) ?? defaultState()
  const next = { ...previous, tasks: change(previous.tasks) }
  const metadata = await repository.loadMetadata(workspaceId)
  const operations = diffRecords(stateToRecords(previous), stateToRecords(next), {
    changedAt: '2026-10-14T04:30:00.000Z',
    operationId: () => operationId,
    baseRevisions: new Map(Object.entries(metadata.revisions)),
  }).filter((operation) => operation.collection === 'tasks')
  await repository.commit(workspaceId, await repository.loadWorkspace(workspaceId), next, operations)
  return next
}

function registration(deviceId: string): DeviceRegistration {
  return { deviceId, name: 'Test browser', platform: 'web', appVersion: '1.1.14' }
}

describe('task synchronization convergence', () => {
  it('retries an offline desktop change and converges with a later phone toggle', async () => {
    const gateway = new InMemoryGateway()
    const desktopRepository = await LocalRepository.open({ indexedDB: new IDBFactory() })
    const phoneRepository = await LocalRepository.open({ indexedDB: new IDBFactory() })
    const desktopNetwork = new TestNetwork(false)
    const desktopScheduler = new ManualScheduler()
    const desktop = new SyncEngine({
      identity: signedIn, workspaceId, deviceId: desktopId, repository: desktopRepository, gateway,
      registration: registration(desktopId), network: desktopNetwork, scheduler: desktopScheduler, random: () => 0,
    })
    const phone = new SyncEngine({
      identity: signedIn, workspaceId, deviceId: phoneId, repository: phoneRepository, gateway,
      registration: registration(phoneId), network: new TestNetwork(true),
    })

    desktop.start()
    await commitTasks(desktopRepository, (tasks) => [...tasks, {
      id: taskId, title: 'Converge safely', done: false, date: '2026-10-14', category: 'work',
    }], '00000000-0000-4000-8000-000000000201')
    gateway.failNextPushFor = desktopId
    desktopNetwork.setOnline(true)
    await vi.waitFor(() => expect(desktop.getState().status).toBe('backoff'))
    expect(await desktopRepository.readPending(workspaceId, 10)).toHaveLength(1)

    desktopScheduler.retryNext()
    await vi.waitFor(() => expect(desktop.getState().status).toBe('idle'))
    await phone.syncNow()
    await commitTasks(phoneRepository, (tasks) => tasks.map((task) => (
      task.id === taskId ? { ...task, done: true } : task
    )), '00000000-0000-4000-8000-000000000202')
    await phone.syncNow()
    await desktop.syncNow()

    const desktopState = await desktopRepository.loadWorkspace(workspaceId)
    const phoneState = await phoneRepository.loadWorkspace(workspaceId)
    expect(desktopState?.tasks).toEqual([expect.objectContaining({ id: taskId, done: true })])
    expect(phoneState?.tasks).toEqual(desktopState?.tasks)
    expect(gateway.records.get(`tasks:${taskId}`)?.revision).toBe(2)
    expect((await desktopRepository.loadMetadata(workspaceId)).revisions[`tasks:${taskId}`]).toBe(2)
    expect((await phoneRepository.loadMetadata(workspaceId)).revisions[`tasks:${taskId}`]).toBe(2)

    desktop.stop()
    phone.stop()
    desktopRepository.close()
    phoneRepository.close()
  })
})
