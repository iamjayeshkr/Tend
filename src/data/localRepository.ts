import type { AppState } from '../core'
import type { SyncOperation } from '../sync/types'
import {
  LEGACY_SNAPSHOT_KEY,
  STORES,
  openTendDatabase,
  requestResult,
  transactionComplete,
} from './indexedDb'

export type RepositoryCapabilities = {
  accountWorkspaces: boolean
  durableQueue: boolean
  recoverySnapshots: boolean
}

export type WorkspaceMetadata = {
  workspaceId: string
  pullCursor?: string
  revisions: Record<string, number>
}

export type AcknowledgeResult = {
  operationIds: string[]
  revisions?: Record<string, number>
}

type RepositoryEnvironment = {
  indexedDB?: IDBFactory
  localStorage?: Storage
}

type QueuedOperation = {
  queueKey: string
  workspaceId: string
  operation: SyncOperation
}

const storageKey = (workspaceId: string) => `workspace:${workspaceId}`
const queueKey = (workspaceId: string, operationId: string) => `${workspaceId}:${operationId}`

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function sameState(left: AppState | null, right: AppState | null): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function explicit<T extends object, K extends keyof T>(source: T, key: K): boolean {
  return Object.prototype.hasOwnProperty.call(source, key)
}

export class LocalRepository {
  readonly capabilities: RepositoryCapabilities
  private writes: Promise<void> = Promise.resolve()

  private constructor(
    private readonly database: IDBDatabase | null,
    private readonly storage: Storage | null,
  ) {
    this.capabilities = database
      ? { accountWorkspaces: true, durableQueue: true, recoverySnapshots: true }
      : { accountWorkspaces: false, durableQueue: false, recoverySnapshots: false }
  }

  static async open(environment: RepositoryEnvironment = {}): Promise<LocalRepository> {
    const factory = explicit(environment, 'indexedDB')
      ? environment.indexedDB
      : globalThis.indexedDB
    if (factory) return new LocalRepository(await openTendDatabase(factory), null)
    const storage = explicit(environment, 'localStorage')
      ? environment.localStorage
      : globalThis.localStorage
    if (!storage) throw new Error('No durable local storage is available.')
    return new LocalRepository(null, storage)
  }

  close(): void {
    this.database?.close()
  }

  private requireWorkspace(workspaceId: string): void {
    if (!this.database && workspaceId !== 'guest') {
      throw new Error('This storage fallback supports guest only.')
    }
  }

  private enqueue(work: () => Promise<void>): Promise<void> {
    const next = this.writes.catch(() => undefined).then(work)
    this.writes = next
    return next
  }

  async loadWorkspace(workspaceId: string): Promise<AppState | null> {
    this.requireWorkspace(workspaceId)
    await this.writes.catch(() => undefined)
    if (!this.database) {
      const raw = this.storage!.getItem(LEGACY_SNAPSHOT_KEY)
      return raw === null ? null : JSON.parse(raw) as AppState
    }
    const transaction = this.database.transaction(STORES.snapshots, 'readonly')
    const raw = await requestResult(transaction.objectStore(STORES.snapshots).get(storageKey(workspaceId)))
    await transactionComplete(transaction)
    return raw === undefined || raw === null ? null : JSON.parse(String(raw)) as AppState
  }

  async readLegacySnapshot(): Promise<string | null> {
    if (!this.database) return this.storage!.getItem(LEGACY_SNAPSHOT_KEY)
    const transaction = this.database.transaction(STORES.snapshots, 'readonly')
    const raw = await requestResult(transaction.objectStore(STORES.snapshots).get(LEGACY_SNAPSHOT_KEY))
    await transactionComplete(transaction)
    return raw === undefined || raw === null ? null : String(raw)
  }

  commit(
    workspaceId: string,
    previous: AppState | null,
    next: AppState,
    operations: SyncOperation[],
  ): Promise<void> {
    this.requireWorkspace(workspaceId)
    const previousSnapshot = previous === null ? null : clone(previous)
    const nextSnapshot = clone(next)
    const operationSnapshots = clone(operations)
    return this.enqueue(async () => {
      if (!this.database) {
        if (operationSnapshots.length) throw new Error('The localStorage fallback has no durable queue.')
        const raw = this.storage!.getItem(LEGACY_SNAPSHOT_KEY)
        const current = raw === null ? null : JSON.parse(raw) as AppState
        if (!sameState(current, previousSnapshot)) throw new Error('Workspace changed in another writer.')
        this.storage!.setItem(LEGACY_SNAPSHOT_KEY, JSON.stringify(nextSnapshot))
        return
      }

      await new Promise<void>((resolve, reject) => {
        const transaction = this.database!.transaction([STORES.snapshots, STORES.operations], 'readwrite')
        const snapshots = transaction.objectStore(STORES.snapshots)
        const queued = transaction.objectStore(STORES.operations)
        let failure: Error | null = null
        const currentRequest = snapshots.get(storageKey(workspaceId))
        currentRequest.onsuccess = () => {
          const current = currentRequest.result === undefined || currentRequest.result === null
            ? null
            : JSON.parse(String(currentRequest.result)) as AppState
          if (!sameState(current, previousSnapshot)) {
            failure = new Error('Workspace changed in another writer.')
            transaction.abort()
            return
          }
          snapshots.put(JSON.stringify(nextSnapshot), storageKey(workspaceId))
          for (const operation of operationSnapshots) {
            const row: QueuedOperation = {
              queueKey: queueKey(workspaceId, operation.operationId),
              workspaceId,
              operation,
            }
            queued.put(row)
          }
        }
        currentRequest.onerror = () => {
          failure = currentRequest.error ?? new Error('Could not read the current workspace.')
          transaction.abort()
        }
        transaction.oncomplete = () => resolve()
        transaction.onabort = () => reject(failure ?? transaction.error ?? new Error('Workspace commit was aborted.'))
        transaction.onerror = () => reject(failure ?? transaction.error ?? new Error('Workspace commit failed.'))
      })
    })
  }

  async readPending(workspaceId: string, limit: number): Promise<SyncOperation[]> {
    this.requireWorkspace(workspaceId)
    await this.writes.catch(() => undefined)
    if (!this.database) return []
    const transaction = this.database.transaction(STORES.operations, 'readonly')
    const rows = await requestResult(
      transaction.objectStore(STORES.operations).index('workspaceId').getAll(workspaceId),
    ) as QueuedOperation[]
    await transactionComplete(transaction)
    return rows
      .map((row) => row.operation)
      .sort((left, right) => left.changedAt.localeCompare(right.changedAt) || left.operationId.localeCompare(right.operationId))
      .slice(0, Math.max(0, limit))
      .map(clone)
  }

  acknowledge(workspaceId: string, result: AcknowledgeResult, pullCursor?: string): Promise<void> {
    this.requireWorkspace(workspaceId)
    if (!this.database) return Promise.reject(new Error('The localStorage fallback has no durable queue.'))
    const acknowledged = [...result.operationIds]
    const revisions = { ...(result.revisions ?? {}) }
    return this.enqueue(async () => {
      const transaction = this.database!.transaction([STORES.operations, STORES.metadata], 'readwrite')
      const operations = transaction.objectStore(STORES.operations)
      const metadataStore = transaction.objectStore(STORES.metadata)
      for (const operationId of acknowledged) operations.delete(queueKey(workspaceId, operationId))
      const existing = await requestResult(metadataStore.get(workspaceId)) as WorkspaceMetadata | undefined
      metadataStore.put({
        workspaceId,
        pullCursor: pullCursor ?? existing?.pullCursor,
        revisions: { ...(existing?.revisions ?? {}), ...revisions },
      } satisfies WorkspaceMetadata)
      await transactionComplete(transaction)
    })
  }

  async loadMetadata(workspaceId: string): Promise<WorkspaceMetadata> {
    this.requireWorkspace(workspaceId)
    await this.writes.catch(() => undefined)
    if (!this.database) return { workspaceId, revisions: {} }
    const transaction = this.database.transaction(STORES.metadata, 'readonly')
    const metadata = await requestResult(transaction.objectStore(STORES.metadata).get(workspaceId)) as WorkspaceMetadata | undefined
    await transactionComplete(transaction)
    return metadata ? clone(metadata) : { workspaceId, revisions: {} }
  }

  saveRecoverySnapshot(workspaceId: string, state: AppState): Promise<void> {
    this.requireWorkspace(workspaceId)
    if (!this.database) return Promise.reject(new Error('The localStorage fallback has no recovery snapshots.'))
    const snapshot = clone(state)
    return this.enqueue(async () => {
      const transaction = this.database!.transaction(STORES.recovery, 'readwrite')
      transaction.objectStore(STORES.recovery).put({ workspaceId, state: snapshot, savedAt: Date.now() })
      await transactionComplete(transaction)
    })
  }

  async loadRecoverySnapshot(workspaceId: string): Promise<AppState | null> {
    this.requireWorkspace(workspaceId)
    await this.writes.catch(() => undefined)
    if (!this.database) return null
    const transaction = this.database.transaction(STORES.recovery, 'readonly')
    const row = await requestResult(transaction.objectStore(STORES.recovery).get(workspaceId)) as { state: AppState } | undefined
    await transactionComplete(transaction)
    return row ? clone(row.state) : null
  }

  deleteWorkspace(workspaceId: string): Promise<void> {
    this.requireWorkspace(workspaceId)
    return this.enqueue(async () => {
      if (!this.database) {
        this.storage!.removeItem(LEGACY_SNAPSHOT_KEY)
        return
      }
      const transaction = this.database!.transaction(
        [STORES.snapshots, STORES.operations, STORES.metadata, STORES.recovery],
        'readwrite',
      )
      transaction.objectStore(STORES.snapshots).delete(storageKey(workspaceId))
      transaction.objectStore(STORES.metadata).delete(workspaceId)
      transaction.objectStore(STORES.recovery).delete(workspaceId)
      const cursor = transaction.objectStore(STORES.operations).index('workspaceId').openCursor(workspaceId)
      cursor.onsuccess = () => {
        const result = cursor.result
        if (!result) return
        result.delete()
        result.continue()
      }
      await transactionComplete(transaction)
    })
  }
}
