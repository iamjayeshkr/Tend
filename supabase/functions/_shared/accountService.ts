import { ApiFailure } from './http.ts'
import type { VerifiedPrincipal } from './auth.ts'
import { parseRemoteRecord, TEND_COLLECTIONS } from '../../../src/sync/schemas.ts'

export const MAX_ACCOUNT_EXPORT_BYTES = 8 * 1024 * 1024
export const MAX_ACCOUNT_EXPORT_RECORDS = 20_000
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type DeviceSummary = {
  deviceId: string
  name: string
  platform: 'web' | 'desktop'
  appVersion: string
  createdAt: string
  lastSeenAt: string
  revokedAt?: string | null
  isCurrentDevice: boolean
}

export type AccountExportBundle = {
  version: 1
  exportedAt: string
  ownerId: string
  collections: Record<string, Array<{ recordId: string; revision: number; data: unknown; modifiedAt: string }>>
}

export type AccountDatabase = {
  isDeviceActive(ownerId: string, deviceId: string): Promise<boolean>
  listDevices(ownerId: string): Promise<Array<{
    id: string
    display_name: string
    platform: 'web' | 'desktop'
    app_version: string
    created_at: string
    last_seen_at: string
    revoked_at: string | null
  }>>
  revokeDevice(ownerId: string, deviceId: string): Promise<boolean>
  exportRecords(ownerId: string): Promise<Array<{
    collection: string
    record_id: string
    revision: number
    data: unknown
    modified_at: string
  }>>
}

export type AccountServiceContext = {
  principal: VerifiedPrincipal
  currentDeviceId: string
  database: AccountDatabase
}

async function requireActiveDevice(context: AccountServiceContext): Promise<void> {
  if (!UUID_PATTERN.test(context.currentDeviceId)) {
    throw new ApiFailure(422, 'DEVICE_REQUIRED', 'A registered device is required.')
  }
  if (!await context.database.isDeviceActive(context.principal.ownerId, context.currentDeviceId)) {
    throw new ApiFailure(403, 'DEVICE_REVOKED', 'This device is not allowed to access the account.')
  }
}

function recentlyReverified(principal: VerifiedPrincipal): boolean {
  const ages = principal.factorVerificationAge
  if (!ages) return false
  const [firstFactorAge, secondFactorAge] = ages
  if (firstFactorAge === -1 && secondFactorAge === -1) return false
  if (secondFactorAge === -1) return firstFactorAge >= 0 && firstFactorAge < 10
  if (firstFactorAge === -1) return secondFactorAge >= 0 && secondFactorAge < 10
  return secondFactorAge < 10
}

function requireRecentReverification(context: AccountServiceContext): void {
  if (!recentlyReverified(context.principal)) {
    throw new ApiFailure(403, 'REVERIFICATION_REQUIRED', 'Verify your identity again to continue.')
  }
}

export async function listDevices(context: AccountServiceContext): Promise<DeviceSummary[]> {
  await requireActiveDevice(context)
  const devices = await context.database.listDevices(context.principal.ownerId)
  return devices.map((d) => ({
    deviceId: d.id,
    name: d.display_name,
    platform: d.platform,
    appVersion: d.app_version,
    createdAt: d.created_at,
    lastSeenAt: d.last_seen_at,
    revokedAt: d.revoked_at,
    isCurrentDevice: context.currentDeviceId !== undefined && d.id === context.currentDeviceId,
  }))
}

export async function revokeDevice(
  context: AccountServiceContext,
  deviceId: string,
): Promise<{ success: boolean; revokedDeviceId: string }> {
  await requireActiveDevice(context)
  requireRecentReverification(context)
  if (!deviceId || typeof deviceId !== 'string' || !UUID_PATTERN.test(deviceId)) {
    throw new ApiFailure(422, 'VALIDATION_FAILED', 'Invalid device ID.')
  }
  const ok = await context.database.revokeDevice(context.principal.ownerId, deviceId)
  if (!ok) {
    throw new ApiFailure(404, 'DEVICE_NOT_FOUND', 'The specified device was not found or is already revoked.')
  }
  return { success: true, revokedDeviceId: deviceId }
}

export async function exportAccountData(context: AccountServiceContext): Promise<AccountExportBundle> {
  await requireActiveDevice(context)
  requireRecentReverification(context)
  const records = await context.database.exportRecords(context.principal.ownerId)
  if (records.length > MAX_ACCOUNT_EXPORT_RECORDS) {
    throw new ApiFailure(413, 'EXPORT_TOO_LARGE', 'The account export is too large to generate safely.')
  }
  const collections = Object.fromEntries(
    TEND_COLLECTIONS.map((collection) => [collection, []]),
  ) as AccountExportBundle['collections']

  for (const r of records) {
    let parsed
    try {
      parsed = parseRemoteRecord({
        collection: r.collection,
        recordId: r.record_id,
        revision: r.revision,
        data: r.data,
        modifiedAt: r.modified_at,
        deletedAt: null,
      })
    } catch {
      throw new ApiFailure(500, 'EXPORT_RECORD_INVALID', 'Stored account data could not be exported safely.')
    }
    collections[parsed.collection].push({
      recordId: parsed.recordId,
      revision: parsed.revision,
      data: parsed.data,
      modifiedAt: parsed.modifiedAt,
    })
  }

  for (const collection of TEND_COLLECTIONS) {
    collections[collection].sort((left, right) => left.recordId.localeCompare(right.recordId))
  }

  const bundle: AccountExportBundle = {
    version: 1,
    exportedAt: new Date().toISOString(),
    ownerId: context.principal.ownerId,
    collections,
  }
  if (new TextEncoder().encode(JSON.stringify(bundle)).byteLength > MAX_ACCOUNT_EXPORT_BYTES) {
    throw new ApiFailure(413, 'EXPORT_TOO_LARGE', 'The account export is too large to generate safely.')
  }
  return bundle
}
