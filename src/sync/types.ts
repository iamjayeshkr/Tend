export type TendCollection =
  | 'tasks'
  | 'routine'
  | 'activities'
  | 'ideas'
  | 'reviews'
  | 'sets'
  | 'wakeLogs'
  | 'sleepLogs'
  | 'settings'

export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }

export type SyncOperation = {
  operationId: string
  collection: TendCollection
  recordId: string
  kind: 'put' | 'patch' | 'delete'
  baseRevision: number
  changedAt: string
  data?: Record<string, JsonValue>
  changedFields?: string[]
  requestHash?: string
}

export type DeviceRegistration = {
  deviceId: string
  name: string
  platform: 'web' | 'desktop'
  appVersion: string
}

export type RemoteRecord = {
  collection: TendCollection
  recordId: string
  revision: number
  modifiedAt: string
  deletedAt: string | null
  data: Record<string, JsonValue> | null
}

export type PushRequest = { deviceId: string; operations: SyncOperation[] }
export type PushResult = {
  operationId: string
  status: 'applied' | 'duplicate' | 'conflict'
  revision?: number
  record?: RemoteRecord
  conflictId?: string
}
export type PushResponse = { results: PushResult[]; cursor?: string }

export type PullRequest = { deviceId: string; cursor?: string; limit: number }
export type PullResponse = { records: RemoteRecord[]; cursor: string; hasMore: boolean }

export type ValidateMigrationRequest = {
  deviceId: string
  dryRun: true
  operations: SyncOperation[]
}
export type ValidateMigrationResponse = {
  accepted: boolean
  recordCount: number
  conflicts: Array<{ collection: TendCollection; recordId: string; reason: string }>
}

export type ApiError = {
  code: string
  message: string
  requestId: string
  retryAfterSeconds?: number
}
