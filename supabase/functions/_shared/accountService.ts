import { ApiFailure } from './http.ts'
import type { VerifiedPrincipal } from './auth.ts'

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
  currentDeviceId?: string
  database: AccountDatabase
}

export async function listDevices(context: AccountServiceContext): Promise<DeviceSummary[]> {
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
  if (!deviceId || typeof deviceId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(deviceId)) {
    throw new ApiFailure(422, 'VALIDATION_FAILED', 'Invalid device ID.')
  }
  const ok = await context.database.revokeDevice(context.principal.ownerId, deviceId)
  if (!ok) {
    throw new ApiFailure(404, 'DEVICE_NOT_FOUND', 'The specified device was not found or is already revoked.')
  }
  return { success: true, revokedDeviceId: deviceId }
}

export async function exportAccountData(context: AccountServiceContext): Promise<AccountExportBundle> {
  const records = await context.database.exportRecords(context.principal.ownerId)
  const collections: AccountExportBundle['collections'] = {
    tasks: [],
    routine: [],
    activities: [],
    ideas: [],
    reviews: [],
    sets: [],
    wakeLogs: [],
    sleepLogs: [],
    settings: [],
  }

  for (const r of records) {
    if (!collections[r.collection]) {
      collections[r.collection] = []
    }
    collections[r.collection].push({
      recordId: r.record_id,
      revision: r.revision,
      data: r.data,
      modifiedAt: r.modified_at,
    })
  }

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    ownerId: context.principal.ownerId,
    collections,
  }
}
