import { canonicalOperation, parsePushResponse, parseValidateMigrationResponse } from '../../../src/sync/schemas.ts'
import type {
  DeviceRegistration,
  PushRequest,
  PushResponse,
  SyncOperation,
  ValidateMigrationRequest,
  ValidateMigrationResponse,
} from '../../../src/sync/types.ts'
import type { VerifiedPrincipal } from './auth.ts'
import {
  DatabaseFailure,
  type DatabaseSyncOperation,
  type SyncDatabase,
} from './database.ts'
import { ApiFailure } from './http.ts'

export type PushServiceContext = {
  principal: VerifiedPrincipal
  database: SyncDatabase
}

function safeDatabaseFailure(error: unknown): never {
  if (!(error instanceof DatabaseFailure)) throw error

  switch (error.code) {
    case 'DEVICE_UNKNOWN':
      throw new ApiFailure(403, 'DEVICE_UNKNOWN', 'Register this device before synchronizing.')
    case 'DEVICE_REVOKED':
      throw new ApiFailure(403, 'DEVICE_REVOKED', 'This device no longer has synchronization access.')
    case 'IDEMPOTENCY_MISMATCH':
      throw new ApiFailure(422, 'IDEMPOTENCY_MISMATCH', 'An operation id was reused with different content.')
    case 'IDEMPOTENCY_IN_FLIGHT':
      throw new ApiFailure(409, 'IDEMPOTENCY_IN_FLIGHT', 'This operation is already being processed.', {
        'Retry-After': '2',
      })
    case 'SYNC_VALIDATION_FAILED':
      throw new ApiFailure(422, 'SYNC_VALIDATION_FAILED', 'The synchronization operation is invalid.')
    case 'DATABASE_RESPONSE_INVALID':
      throw new ApiFailure(500, 'DATABASE_RESPONSE_INVALID', 'The synchronization service returned an invalid response.')
    default:
      throw new ApiFailure(503, 'SYNC_UNAVAILABLE', 'Synchronization is temporarily unavailable.', {
        'Retry-After': '5',
      })
  }
}

function cleanOperation(operation: SyncOperation): Omit<SyncOperation, 'requestHash'> {
  return {
    operationId: operation.operationId,
    collection: operation.collection,
    recordId: operation.recordId,
    kind: operation.kind,
    baseRevision: operation.baseRevision,
    changedAt: operation.changedAt,
    ...(operation.data === undefined ? {} : { data: operation.data }),
    ...(operation.changedFields === undefined ? {} : { changedFields: [...operation.changedFields] }),
  }
}

function digestHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function databaseOperation(operation: SyncOperation): Promise<DatabaseSyncOperation> {
  const clean = cleanOperation(operation)
  const hash = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(canonicalOperation(clean)),
  )
  return { ...clean, requestHash: digestHex(hash) }
}

async function sortedDatabaseOperations(operations: SyncOperation[]): Promise<DatabaseSyncOperation[]> {
  const indexed = operations.map((operation, index) => ({ operation, index }))
  indexed.sort((left, right) => (
    left.operation.collection.localeCompare(right.operation.collection)
    || left.operation.recordId.localeCompare(right.operation.recordId)
    || left.index - right.index
  ))
  return Promise.all(indexed.map(({ operation }) => databaseOperation(operation)))
}

export async function registerDevice(
  context: PushServiceContext,
  registration: DeviceRegistration,
): Promise<{ status: 'registered' | 'active' }> {
  try {
    return await context.database.registerDevice({
      ownerId: context.principal.ownerId,
      deviceId: registration.deviceId,
      displayName: registration.name,
      platform: registration.platform,
      appVersion: registration.appVersion,
    })
  } catch (error) {
    return safeDatabaseFailure(error)
  }
}

export async function validateMigration(
  context: PushServiceContext,
  request: ValidateMigrationRequest,
): Promise<ValidateMigrationResponse> {
  if (request.operations.length > 100) {
    throw new ApiFailure(413, 'BATCH_TOO_LARGE', 'At most 100 operations are allowed.')
  }
  try {
    const response = await context.database.validateMigration({
      ownerId: context.principal.ownerId,
      deviceId: request.deviceId,
      operations: await sortedDatabaseOperations(request.operations),
    })
    return parseValidateMigrationResponse(response)
  } catch (error) {
    return safeDatabaseFailure(error)
  }
}

export async function pushOperations(
  context: PushServiceContext,
  request: PushRequest,
): Promise<PushResponse> {
  if (request.operations.length > 100) {
    throw new ApiFailure(413, 'BATCH_TOO_LARGE', 'At most 100 operations are allowed.')
  }
  try {
    const response = await context.database.applyPush({
      ownerId: context.principal.ownerId,
      deviceId: request.deviceId,
      operations: await sortedDatabaseOperations(request.operations),
    })
    return parsePushResponse(response)
  } catch (error) {
    return safeDatabaseFailure(error)
  }
}
