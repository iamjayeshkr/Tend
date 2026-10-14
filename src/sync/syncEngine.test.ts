import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it, vi } from 'vitest'

import { defaultState, type AppState } from '../core'
import { LocalRepository, type AcknowledgeResult, type WorkspaceMetadata } from '../data/localRepository'
import type { TendIdentity } from '../auth/types'
import { GatewayError, type SyncGateway } from './gatewayClient'
import { SyncEngine, type SyncEngineScheduler, type SyncRepository } from './syncEngine'
import type { PullResponse, PushResponse, SyncOperation } from './types'

const deviceId = '8db46216-8f06-4d87-a240-15f153c783b4'
const operation: SyncOperation = {
  operationId: '00000000-0000-4000-8000-000000000001',
  collection: 'tasks', recordId: 'task-local', kind: 'put', baseRevision: 0,
  changedAt: '2026-10-14T04:30:00.000Z',
  data: { title: 'Local', done: false, date: '2026-10-14', category: 'work' },
}

const signedIn: TendIdentity = {
  status: 'signedIn', cloudAvailable: true, userId: 'user_a',
  getAccessToken: async () => 'token', signOut: async () => undefined,
}

function gateway(overrides: Partial<SyncGateway> = {}): SyncGateway {
  return {
    registerDevice: vi.fn(async () => ({ status: 'active' as const })),
    validateMigration: vi.fn(async () => ({ accepted: true, recordCount: 0, conflicts: [] })),
    push: vi.fn(async ({ operations }: Parameters<SyncGateway['push']>[0]): Promise<PushResponse> => ({
      results: operations.map((item) => ({ operationId: item.operationId, status: 'applied', revision: 1 })),
    })),
    pull: vi.fn(async ({ cursor }): Promise<PullResponse> => ({ records: [], cursor: cursor ?? 'cursor-1', hasMore: false })),
    ...overrides,
  }
}

function engineOptions(repository: SyncRepository, syncGateway: SyncGateway, overrides: Record<string, unknown> = {}) {
  return {
    identity: signedIn,
    workspaceId: 'account:user_a',
    deviceId,
    repository,
    gateway: syncGateway,
    network: { isOnline: () => true, subscribe: () => () => undefined },
    scheduler: { setTimeout: () => 1, clearTimeout: () => undefined } as SyncEngineScheduler,
    random: () => 0.5,
    now: () => 1_792_000_000_000,
    ...overrides,
  }
}

class MemoryRepository implements SyncRepository {
  state: AppState = defaultState()
  pending: SyncOperation[] = []
  metadata: WorkspaceMetadata = { workspaceId: 'account:user_a', revisions: {} }
  failNextAcknowledge = false
  readonly events: string[] = []

  async loadWorkspace(): Promise<AppState> { return structuredClone(this.state) }
  async readPending(_workspaceId: string, limit: number): Promise<SyncOperation[]> { return this.pending.slice(0, limit) }
  async loadMetadata(): Promise<WorkspaceMetadata> { return structuredClone(this.metadata) }
  async commit(_workspaceId: string, _previous: AppState | null, next: AppState): Promise<void> {
    this.events.push('commit')
    this.state = structuredClone(next)
  }
  async acknowledge(_workspaceId: string, result: AcknowledgeResult, cursor?: string): Promise<void> {
    this.events.push('acknowledge')
    if (this.failNextAcknowledge) {
      this.failNextAcknowledge = false
      throw new Error('simulated crash before cursor acknowledgement')
    }
    this.pending = this.pending.filter((item) => !result.operationIds.includes(item.operationId))
    this.metadata = {
      workspaceId: this.metadata.workspaceId,
      pullCursor: cursor ?? this.metadata.pullCursor,
      revisions: { ...this.metadata.revisions, ...(result.revisions ?? {}) },
    }
  }
}

describe('SyncEngine durability', () => {
  it('pushes an already-durable local queue before pulling and acknowledges it atomically', async () => {
    const repository = await LocalRepository.open({ indexedDB: new IDBFactory() })
    const state = defaultState()
    await repository.commit('account:user_a', null, state, [operation])
    const syncGateway = gateway()
    const engine = new SyncEngine(engineOptions(repository, syncGateway))

    await engine.syncNow()
    expect(vi.mocked(syncGateway.push).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(syncGateway.pull).mock.invocationCallOrder[0]!)
    expect(await repository.readPending('account:user_a', 10)).toEqual([])
    repository.close()
  })

  it('commits a pulled page before acknowledging its cursor', async () => {
    const repository = new MemoryRepository()
    const syncGateway = gateway({
      pull: vi.fn(async (): Promise<PullResponse> => ({ records: [{
        collection: 'tasks', recordId: 'remote', revision: 2,
        modifiedAt: '2026-10-14T04:30:00.000Z', deletedAt: null,
        data: { title: 'Remote', done: false, date: '2026-10-14', category: 'work' },
      }], cursor: 'cursor-2', hasMore: false })),
    })
    await new SyncEngine(engineOptions(repository, syncGateway)).syncNow()
    expect(repository.events).toEqual(['commit', 'acknowledge'])
    expect(repository.state.tasks.map((task) => task.id)).toContain('remote')
    expect(repository.metadata.pullCursor).toBe('cursor-2')
  })

  it('safely replays a page after records committed but cursor acknowledgement was interrupted', async () => {
    const repository = new MemoryRepository()
    repository.failNextAcknowledge = true
    const pull = vi.fn(async ({ cursor }: { cursor?: string }) => ({ records: [{
      collection: 'tasks' as const, recordId: 'remote', revision: 1,
      modifiedAt: '2026-10-14T04:30:00.000Z', deletedAt: null,
      data: { title: 'Remote', done: false, date: '2026-10-14', category: 'work' as const },
    }], cursor: cursor ?? 'cursor-1', hasMore: false }))
    let retry: () => void = () => undefined
    const engine = new SyncEngine(engineOptions(repository, gateway({ pull }), {
      scheduler: {
        setTimeout: (callback: () => void) => { retry = callback; return 1 },
        clearTimeout: () => undefined,
      },
    }))

    await engine.syncNow()
    retry()
    await vi.waitFor(() => expect(pull).toHaveBeenCalledTimes(2))
    expect(pull.mock.calls.map(([request]) => request.cursor)).toEqual([undefined, undefined])
    expect(repository.state.tasks.filter((task) => task.id === 'remote')).toHaveLength(1)
    expect(repository.metadata.pullCursor).toBe('cursor-1')
  })

  it('pushes every pending operation before full reconciliation after CURSOR_EXPIRED', async () => {
    const repository = new MemoryRepository()
    repository.pending = [operation]
    repository.metadata.pullCursor = 'expired-cursor'
    repository.state.tasks = [{ id: 'cloud-deleted', title: 'Old', done: false, date: '2026-10-14', category: 'work' }]
    const calls: string[] = []
    const syncGateway = gateway({
      push: vi.fn(async ({ operations }: Parameters<SyncGateway['push']>[0]) => {
        calls.push('push')
        return { results: operations.map((item) => ({ operationId: item.operationId, status: 'applied' as const, revision: 1 })) }
      }),
      pull: vi.fn(async ({ cursor }) => {
        calls.push(`pull:${cursor ?? 'bootstrap'}`)
        if (cursor === 'expired-cursor') throw new GatewayError({ status: 410, code: 'CURSOR_EXPIRED', retryable: false })
        return { records: [], cursor: 'fresh-cursor', hasMore: false }
      }),
    })
    await new SyncEngine(engineOptions(repository, syncGateway)).syncNow()

    expect(calls).toEqual(['push', 'pull:expired-cursor', 'pull:bootstrap'])
    expect(repository.state.tasks).toEqual([])
    expect(repository.metadata.pullCursor).toBe('fresh-cursor')
  })
})

describe('SyncEngine scheduling', () => {
  it('uses exponential jittered backoff, honors Retry-After, and never creates duplicate timers', async () => {
    const repository = new MemoryRepository()
    const scheduled: Array<{ callback: () => void; delay: number }> = []
    const scheduler: SyncEngineScheduler = {
      setTimeout: (callback, delay) => { scheduled.push({ callback, delay }); return scheduled.length },
      clearTimeout: vi.fn(),
    }
    const push = vi.fn(async () => { throw new GatewayError({ status: 429, code: 'RATE_LIMITED', retryable: true, retryAfterSeconds: 3 }) })
    repository.pending = [operation]
    const engine = new SyncEngine(engineOptions(repository, gateway({ push }), { scheduler, random: () => 0 }))

    await engine.syncNow()
    await engine.syncNow()
    expect(scheduled.map(({ delay }) => delay)).toEqual([3_000])
    scheduled[0]!.callback()
    await vi.waitFor(() => expect(scheduled[1]?.delay).toBe(3_000))
  })

  it('increases retry delays exponentially when the server supplies no Retry-After', async () => {
    const repository = new MemoryRepository()
    const scheduled: Array<{ callback: () => void; delay: number }> = []
    const scheduler: SyncEngineScheduler = {
      setTimeout: (callback, delay) => { scheduled.push({ callback, delay }); return scheduled.length },
      clearTimeout: vi.fn(),
    }
    const push = vi.fn(async () => {
      throw new GatewayError({ status: 503, code: 'SERVER_ERROR', retryable: true })
    })
    repository.pending = [operation]
    const engine = new SyncEngine(engineOptions(repository, gateway({ push }), { scheduler, random: () => 0 }))

    await engine.syncNow()
    expect(scheduled[0]?.delay).toBe(500)
    scheduled[0]!.callback()
    await vi.waitFor(() => expect(scheduled[1]?.delay).toBe(1_000))
  })

  it('does not shorten a long server Retry-After to the local backoff cap', async () => {
    const repository = new MemoryRepository()
    const scheduled: number[] = []
    const scheduler: SyncEngineScheduler = {
      setTimeout: (_callback, delay) => { scheduled.push(delay); return scheduled.length },
      clearTimeout: vi.fn(),
    }
    repository.pending = [operation]
    const push = vi.fn(async () => {
      throw new GatewayError({ status: 429, code: 'RATE_LIMITED', retryable: true, retryAfterSeconds: 120 })
    })

    await new SyncEngine(engineOptions(repository, gateway({ push }), { scheduler, random: () => 0 })).syncNow()
    expect(scheduled).toEqual([120_000])
  })

  it('pauses offline and resumes only from an online notification', async () => {
    const repository = new MemoryRepository()
    let online = false
    let notify: () => void = () => undefined
    const syncGateway = gateway()
    const engine = new SyncEngine(engineOptions(repository, syncGateway, {
      network: {
        isOnline: () => online,
        subscribe: (listener: () => void) => { notify = listener; return () => undefined },
      },
    }))
    engine.start()
    await Promise.resolve()
    expect(engine.getState().status).toBe('offline')
    expect(syncGateway.pull).not.toHaveBeenCalled()

    online = true
    notify()
    await vi.waitFor(() => expect(syncGateway.pull).toHaveBeenCalledOnce())
  })

  it.each([
    { status: 'guest', cloudAvailable: false },
    { status: 'loading', cloudAvailable: true },
    { status: 'locked', cloudAvailable: true, userId: 'user_a' },
  ] as const)('never starts synchronization for $status identity', async (identity) => {
    const repository = new MemoryRepository()
    const syncGateway = gateway()
    const engine = new SyncEngine(engineOptions(repository, syncGateway, { identity }))
    engine.start()
    await engine.syncNow()
    expect(engine.getState().status).toBe('stopped')
    expect(syncGateway.push).not.toHaveBeenCalled()
    expect(syncGateway.pull).not.toHaveBeenCalled()
  })
})
