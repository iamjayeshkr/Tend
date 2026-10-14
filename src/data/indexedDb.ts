export const TEND_DATABASE_NAME = 'tend'
export const TEND_DATABASE_VERSION = 2
export const LEGACY_SNAPSHOT_KEY = 'tend.state.v1'
export const STORES = {
  snapshots: 'snapshots',
  operations: 'operations',
  metadata: 'metadata',
  recovery: 'recovery',
} as const

export function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'))
  })
}

export function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction was aborted.'))
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed.'))
  })
}

export function openTendDatabase(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open(TEND_DATABASE_NAME, TEND_DATABASE_VERSION)
    let abandoned = false
    request.onupgradeneeded = (event) => {
      const database = request.result
      const transaction = request.transaction!
      const snapshots = database.objectStoreNames.contains(STORES.snapshots)
        ? transaction.objectStore(STORES.snapshots)
        : database.createObjectStore(STORES.snapshots)

      if (!database.objectStoreNames.contains(STORES.operations)) {
        const operations = database.createObjectStore(STORES.operations, { keyPath: 'queueKey' })
        operations.createIndex('workspaceId', 'workspaceId', { unique: false })
      }
      if (!database.objectStoreNames.contains(STORES.metadata)) {
        database.createObjectStore(STORES.metadata, { keyPath: 'workspaceId' })
      }
      if (!database.objectStoreNames.contains(STORES.recovery)) {
        database.createObjectStore(STORES.recovery, { keyPath: 'workspaceId' })
      }

      if ((event.oldVersion ?? 0) === 1) {
        const legacy = snapshots.get(LEGACY_SNAPSHOT_KEY)
        legacy.onsuccess = () => {
          if (legacy.result !== undefined && legacy.result !== null) {
            snapshots.put(legacy.result, 'workspace:guest')
          }
        }
        legacy.onerror = () => transaction.abort()
      }
    }
    request.onerror = () => reject(request.error ?? new Error('Could not open local storage.'))
    request.onblocked = () => {
      abandoned = true
      reject(new Error('Close other Tend tabs to finish updating local storage.'))
    }
    request.onsuccess = () => {
      const database = request.result
      if (abandoned) { database.close(); return }
      database.onversionchange = () => database.close()
      resolve(database)
    }
  })
}
