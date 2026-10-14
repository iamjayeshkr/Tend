import {
  parsePushResponse,
  parseValidateMigrationResponse,
} from '../../../src/sync/schemas.ts'
import type {
  DeviceRegistration,
  PushResponse,
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

export function createSyncDatabase(client: SupabaseRpcClient): SyncDatabase {
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
  }
}
