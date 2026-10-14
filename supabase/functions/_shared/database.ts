import {
  parseRemoteRecord,
  parsePushResponse,
  parseValidateMigrationResponse,
} from '../../../src/sync/schemas.ts'
import type {
  DeviceRegistration,
  PushResponse,
  RemoteRecord,
  SyncOperation,
  ValidateMigrationResponse,
} from '../../../src/sync/types.ts'

export type DatabaseSyncOperation = Omit<SyncOperation, 'requestHash'> & { requestHash: string }

export type RegisterDeviceInput = {
  ownerId: string
  deviceId: string
  displayName: DeviceRegistration['name']
  platform: DeviceRegistration['platform']
  appVersion: string
}

export type ValidateMigrationInput = {
  ownerId: string
  deviceId: string
  operations: DatabaseSyncOperation[]
}

export type ApplyPushInput = ValidateMigrationInput

export type SyncDatabase = {
  registerDevice(input: RegisterDeviceInput): Promise<{ status: 'registered' | 'active' }>
  validateMigration(input: ValidateMigrationInput): Promise<ValidateMigrationResponse>
  applyPush(input: ApplyPushInput): Promise<PushResponse>
}

export type PullDatabaseInput = {
  ownerId: string
  deviceId: string
  afterSequence: string | null
  afterRecordId: string
  bootstrap: boolean
  limit: number
}

export type DatabasePullPage = {
  records: RemoteRecord[]
  nextSequence: string
  nextRecordId: string
  hasMore: boolean
}

export type PullDatabase = {
  pullChanges(input: PullDatabaseInput): Promise<DatabasePullPage>
}

export class DatabaseFailure extends Error {
  readonly code: string

  constructor(code: string) {
    super('The synchronization database operation failed.')
    this.name = 'DatabaseFailure'
    this.code = code
  }
}

type RpcError = { code?: string; message?: string } | null
type RpcResult = { data: unknown; error: RpcError }

export type SupabaseRpcClient = {
  rpc(name: string, parameters: Record<string, unknown>): PromiseLike<RpcResult>
}

const DATABASE_ERROR_CODES: Readonly<Record<string, string>> = {
  TD401: 'DEVICE_UNKNOWN',
  TD402: 'DEVICE_REVOKED',
  TI409: 'IDEMPOTENCY_IN_FLIGHT',
  TH422: 'IDEMPOTENCY_MISMATCH',
  TV422: 'SYNC_VALIDATION_FAILED',
  TC410: 'CURSOR_EXPIRED',
}

function databaseFailure(error: Exclude<RpcError, null>): DatabaseFailure {
  return new DatabaseFailure(DATABASE_ERROR_CODES[error.code ?? ''] ?? 'DATABASE_UNAVAILABLE')
}

async function callRpc(
  client: SupabaseRpcClient,
  name: string,
  parameters: Record<string, unknown>,
): Promise<unknown> {
  const { data, error } = await client.rpc(name, parameters)
  if (error) throw databaseFailure(error)
  return data
}

function parseDatabasePullPage(value: unknown): DatabasePullPage {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new DatabaseFailure('DATABASE_RESPONSE_INVALID')
  }
  const page = value as Record<string, unknown>
  if (
    Object.keys(page).sort().join(',') !== 'hasMore,nextRecordId,nextSequence,records'
    || !Array.isArray(page.records)
    || page.records.length > 500
    || typeof page.nextSequence !== 'string'
    || !/^\d+$/.test(page.nextSequence)
    || typeof page.nextRecordId !== 'string'
    || page.nextRecordId.length > 128
    || typeof page.hasMore !== 'boolean'
  ) {
    throw new DatabaseFailure('DATABASE_RESPONSE_INVALID')
  }
  try {
    return {
      records: page.records.map(parseRemoteRecord),
      nextSequence: page.nextSequence,
      nextRecordId: page.nextRecordId,
      hasMore: page.hasMore,
    }
  } catch {
    throw new DatabaseFailure('DATABASE_RESPONSE_INVALID')
  }
}

export function createSyncDatabase(client: SupabaseRpcClient): SyncDatabase & PullDatabase {
  return {
    async registerDevice(input) {
      const data = await callRpc(client, 'tend_register_device', {
        p_owner_id: input.ownerId,
        p_device_id: input.deviceId,
        p_display_name: input.displayName,
        p_platform: input.platform,
        p_app_version: input.appVersion,
      })
      if (!data || typeof data !== 'object') throw new DatabaseFailure('DATABASE_RESPONSE_INVALID')
      const status = (data as { status?: unknown }).status
      if (status !== 'registered' && status !== 'active') {
        throw new DatabaseFailure('DATABASE_RESPONSE_INVALID')
      }
      return { status }
    },

    async validateMigration(input) {
      const data = await callRpc(client, 'tend_validate_sync_migration', {
        p_owner_id: input.ownerId,
        p_device_id: input.deviceId,
        p_operations: input.operations,
      })
      try {
        return parseValidateMigrationResponse(data)
      } catch {
        throw new DatabaseFailure('DATABASE_RESPONSE_INVALID')
      }
    },

    async applyPush(input) {
      const data = await callRpc(client, 'tend_apply_sync_push', {
        p_owner_id: input.ownerId,
        p_device_id: input.deviceId,
        p_operations: input.operations,
      })
      try {
        return parsePushResponse(data)
      } catch {
        throw new DatabaseFailure('DATABASE_RESPONSE_INVALID')
      }
    },

    async pullChanges(input) {
      const data = await callRpc(client, 'tend_pull_sync_changes', {
        p_owner_id: input.ownerId,
        p_device_id: input.deviceId,
        p_after_sequence: input.afterSequence,
        p_after_record_id: input.afterRecordId,
        p_bootstrap: input.bootstrap,
        p_limit: input.limit,
      })
      return parseDatabasePullPage(data)
    },
  }
}
