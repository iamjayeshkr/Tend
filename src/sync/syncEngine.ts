import type { TendIdentity } from '../auth/types'
import { defaultState, type AppState } from '../core'
import type { AcknowledgeResult, LocalRepository, WorkspaceMetadata } from '../data/localRepository'
import { GatewayError, type SyncGateway } from './gatewayClient'
import { recordKey, recordsToState } from './recordAdapter'
import type { PullResponse, RemoteRecord, SyncOperation } from './types'

const PUSH_BATCH_SIZE = 100
const PULL_PAGE_SIZE = 500
const MAX_PULL_PAGES = 10_000
const MAX_BACKOFF_MS = 60_000

export type SyncStatus = 'stopped' | 'idle' | 'syncing' | 'offline' | 'backoff' | 'error'

export type SyncState = {
  status: SyncStatus
  pendingCount: number
  attempt: number
  lastSyncedAt?: number
  nextRetryAt?: number
  errorCode?: string
}

export type SyncRepository = Pick<
  LocalRepository,
  'loadWorkspace' | 'readPending' | 'loadMetadata' | 'commit' | 'acknowledge'
>

export type SyncEngineNetwork = {
  isOnline(): boolean
  subscribe(listener: () => void): () => void
}

export type SyncEngineScheduler = {
  setTimeout(callback: () => void, delayMs: number): unknown
  clearTimeout(timer: unknown): void
}

export type SyncEngineOptions = {
  identity: TendIdentity
  workspaceId: string
  deviceId: string
  repository: SyncRepository
  gateway: SyncGateway
  network?: SyncEngineNetwork
  scheduler?: SyncEngineScheduler
  random?: () => number
  now?: () => number
  onWorkspaceUpdated?: (state: AppState) => void
}

function browserNetwork(): SyncEngineNetwork {
  return {
    isOnline: () => typeof navigator === 'undefined' || navigator.onLine,
    subscribe(listener) {
      if (typeof window === 'undefined') return () => undefined
      window.addEventListener('online', listener)
      window.addEventListener('offline', listener)
      return () => {
        window.removeEventListener('online', listener)
        window.removeEventListener('offline', listener)
      }
    },
  }
}

function browserScheduler(): SyncEngineScheduler {
  return {
    setTimeout: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
    clearTimeout: (timer) => globalThis.clearTimeout(timer as ReturnType<typeof setTimeout>),
  }
}

function isEligible(identity: TendIdentity, workspaceId: string): identity is Extract<TendIdentity, { status: 'signedIn' }> {
  return identity.status === 'signedIn' && workspaceId === `account:${identity.userId}`
}

function revisionsFor(records: readonly RemoteRecord[]): Record<string, number> {
  return Object.fromEntries(records.map((record) => [recordKey(record.collection, record.recordId), record.revision]))
}

function fullReconciliationBase(current: AppState): AppState {
  const defaults = defaultState()
  const base = structuredClone(current)
  base.tasks = []
  base.routine = []
  base.activities = []
  base.ideas = []
  base.reviews = []
  base.sets = []
  base.wakeLogs = {}
  base.sleepLogs = {}
  base.settings.name = defaults.settings.name
  base.settings.wake = defaults.settings.wake
  base.settings.sleep = defaults.settings.sleep
  base.settings.focusMinutes = defaults.settings.focusMinutes
  base.settings.breakMinutes = defaults.settings.breakMinutes
  base.settings.theme = defaults.settings.theme
  base.settings.cooldownMinutes = defaults.settings.cooldownMinutes
  base.settings.logDeadline = defaults.settings.logDeadline
  base.settings.earliestLogMinutesBefore = defaults.settings.earliestLogMinutesBefore
  return base
}

export class SyncEngine {
  private readonly network: SyncEngineNetwork
  private readonly scheduler: SyncEngineScheduler
  private readonly random: () => number
  private readonly now: () => number
  private readonly listeners = new Set<(state: SyncState) => void>()
  private state: SyncState = { status: 'stopped', pendingCount: 0, attempt: 0 }
  private started = false
  private unsubscribeNetwork: (() => void) | null = null
  private retryTimer: unknown | null = null
  private activeController: AbortController | null = null
  private currentRun: Promise<void> | null = null

  constructor(private readonly options: SyncEngineOptions) {
    this.network = options.network ?? browserNetwork()
    this.scheduler = options.scheduler ?? browserScheduler()
    this.random = options.random ?? Math.random
    this.now = options.now ?? Date.now
  }

  getState(): SyncState {
    return { ...this.state }
  }

  subscribe(listener: (state: SyncState) => void): () => void {
    this.listeners.add(listener)
    listener(this.getState())
    return () => this.listeners.delete(listener)
  }

  private update(patch: Partial<SyncState>): void {
    this.state = { ...this.state, ...patch }
    for (const listener of this.listeners) listener(this.getState())
  }

  start(): void {
    if (this.started) return
    if (!isEligible(this.options.identity, this.options.workspaceId)) {
      this.update({ status: 'stopped', pendingCount: 0, attempt: 0 })
      return
    }
    this.started = true
    this.unsubscribeNetwork = this.network.subscribe(() => {
      if (!this.network.isOnline()) {
        this.update({ status: 'offline', nextRetryAt: undefined })
        return
      }
      void this.syncNow()
    })
    if (!this.network.isOnline()) {
      this.update({ status: 'offline' })
      return
    }
    void this.syncNow()
  }

  stop(): void {
    this.started = false
    this.unsubscribeNetwork?.()
    this.unsubscribeNetwork = null
    if (this.retryTimer !== null) this.scheduler.clearTimeout(this.retryTimer)
    this.retryTimer = null
    this.activeController?.abort()
    this.activeController = null
    this.update({ status: 'stopped', nextRetryAt: undefined })
  }

  syncNow(): Promise<void> {
    if (!isEligible(this.options.identity, this.options.workspaceId)) {
      this.update({ status: 'stopped', pendingCount: 0, attempt: 0 })
      return Promise.resolve()
    }
    if (!this.network.isOnline()) {
      this.update({ status: 'offline', nextRetryAt: undefined })
      return Promise.resolve()
    }
    if (this.currentRun) return this.currentRun
    if (this.retryTimer !== null) return Promise.resolve()

    const controller = new AbortController()
    this.activeController = controller
    this.update({ status: 'syncing', errorCode: undefined, nextRetryAt: undefined })
    const run = this.runCycle(controller.signal)
      .then(async () => {
        const pendingCount = (await this.options.repository.readPending(this.options.workspaceId, 101)).length
        this.update({
          status: 'idle', pendingCount, attempt: 0, lastSyncedAt: this.now(),
          nextRetryAt: undefined, errorCode: undefined,
        })
      })
      .catch((error: unknown) => this.handleFailure(error, controller.signal))
      .finally(() => {
        if (this.activeController === controller) this.activeController = null
        if (this.currentRun === run) this.currentRun = null
      })
    this.currentRun = run
    return run
  }

  private async runCycle(signal: AbortSignal): Promise<void> {
    await this.pushPending(signal)
    await this.pullIncremental(signal)
  }

  private async pushPending(signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      const operations = await this.options.repository.readPending(this.options.workspaceId, PUSH_BATCH_SIZE)
      this.update({ pendingCount: operations.length })
      if (operations.length === 0) return

      const response = await this.options.gateway.push({
        deviceId: this.options.deviceId,
        operations,
      }, { signal })
      const resultById = new Map(response.results.map((result) => [result.operationId, result]))
      if (resultById.size !== operations.length || response.results.length !== operations.length) {
        throw new GatewayError({ status: 502, code: 'INVALID_RESPONSE', retryable: true })
      }

      const revisions: Record<string, number> = {}
      const operationIds: string[] = []
      for (const operation of operations) {
        const result = resultById.get(operation.operationId)
        if (!result) throw new GatewayError({ status: 502, code: 'INVALID_RESPONSE', retryable: true })
        operationIds.push(operation.operationId)
        const revision = result.record?.revision ?? result.revision
        if (revision !== undefined) revisions[recordKey(operation.collection, operation.recordId)] = revision
      }
      await this.options.repository.acknowledge(this.options.workspaceId, { operationIds, revisions })
    }
  }

  private async pullIncremental(signal: AbortSignal): Promise<void> {
    const metadata = await this.options.repository.loadMetadata(this.options.workspaceId)
    try {
      await this.pullAndCommitPages(metadata.pullCursor, signal)
    } catch (error) {
      if (error instanceof GatewayError && error.status === 410 && error.code === 'CURSOR_EXPIRED') {
        await this.fullReconcile(signal)
        return
      }
      throw error
    }
  }

  private async pullAndCommitPages(initialCursor: string | undefined, signal: AbortSignal): Promise<void> {
    let cursor = initialCursor
    for (let pageIndex = 0; pageIndex < MAX_PULL_PAGES; pageIndex += 1) {
      const page = await this.options.gateway.pull({
        deviceId: this.options.deviceId,
        ...(cursor === undefined ? {} : { cursor }),
        limit: PULL_PAGE_SIZE,
      }, { signal })
      if (page.hasMore && page.cursor === cursor) {
        throw new GatewayError({ status: 502, code: 'INVALID_RESPONSE', retryable: true })
      }
      await this.commitPage(page)
      cursor = page.cursor
      if (!page.hasMore) return
    }
    throw new GatewayError({ status: 502, code: 'INVALID_RESPONSE', retryable: true })
  }

  private async commitPage(page: PullResponse): Promise<void> {
    const previous = await this.options.repository.loadWorkspace(this.options.workspaceId)
    const next = recordsToState(previous ?? defaultState(), page.records)
    await this.options.repository.commit(this.options.workspaceId, previous, next, [])
    await this.options.repository.acknowledge(
      this.options.workspaceId,
      { operationIds: [], revisions: revisionsFor(page.records) },
      page.cursor,
    )
    this.options.onWorkspaceUpdated?.(next)
  }

  private async fullReconcile(signal: AbortSignal): Promise<void> {
    const records: RemoteRecord[] = []
    let cursor: string | undefined
    for (let pageIndex = 0; pageIndex < MAX_PULL_PAGES; pageIndex += 1) {
      const page = await this.options.gateway.pull({
        deviceId: this.options.deviceId,
        ...(cursor === undefined ? {} : { cursor }),
        limit: PULL_PAGE_SIZE,
      }, { signal })
      if (page.hasMore && page.cursor === cursor) {
        throw new GatewayError({ status: 502, code: 'INVALID_RESPONSE', retryable: true })
      }
      records.push(...page.records)
      cursor = page.cursor
      if (!page.hasMore) {
        const previous = await this.options.repository.loadWorkspace(this.options.workspaceId)
        const next = recordsToState(fullReconciliationBase(previous ?? defaultState()), records)
        await this.options.repository.commit(this.options.workspaceId, previous, next, [])
        await this.options.repository.acknowledge(
          this.options.workspaceId,
          { operationIds: [], revisions: revisionsFor(records) },
          cursor,
        )
        this.options.onWorkspaceUpdated?.(next)
        return
      }
    }
    throw new GatewayError({ status: 502, code: 'INVALID_RESPONSE', retryable: true })
  }

  private handleFailure(error: unknown, signal: AbortSignal): void {
    if (signal.aborted || (error instanceof GatewayError && error.code === 'CANCELLED')) {
      this.update({ status: this.started ? 'idle' : 'stopped', nextRetryAt: undefined })
      return
    }

    const gatewayError = error instanceof GatewayError
      ? error
      : new GatewayError({ code: 'LOCAL_FAILURE', retryable: true })
    if (!gatewayError.retryable) {
      this.update({ status: 'error', errorCode: gatewayError.code, nextRetryAt: undefined })
      return
    }

    const attempt = this.state.attempt + 1
    const random = Math.min(1, Math.max(0, this.random()))
    const exponential = Math.min(MAX_BACKOFF_MS, 1_000 * (2 ** Math.min(attempt - 1, 10)))
    const jittered = Math.max(1, Math.round(exponential * (0.5 + random)))
    const retryAfterMs = gatewayError.retryAfterSeconds === undefined
      ? undefined
      : gatewayError.retryAfterSeconds * 1_000
    const boundedDelay = retryAfterMs === undefined ? jittered : Math.max(jittered, retryAfterMs)
    this.update({
      status: 'backoff', attempt, errorCode: gatewayError.code,
      nextRetryAt: this.now() + boundedDelay,
    })
    if (this.retryTimer === null) {
      this.retryTimer = this.scheduler.setTimeout(() => {
        this.retryTimer = null
        void this.syncNow()
      }, boundedDelay)
    }
  }
}
