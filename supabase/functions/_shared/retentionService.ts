import { ApiFailure } from './http.ts'

export type RetentionSummary = {
  purgedTombstones: number
  purgedOperations: number
  purgedConflicts: number
  purgedSecurityEvents: number
  retentionFloorsAdvanced: number
  timestamp: string
}

export type RetentionDatabase = {
  advanceRetentionFloorBeforePurge(cutoff: string): Promise<number>
  purgeExpiredTombstones(cutoff: string, batchLimit?: number): Promise<number>
  purgeExpiredOperations(cutoff: string, batchLimit?: number): Promise<number>
  purgeExpiredConflicts(cutoff: string, batchLimit?: number): Promise<number>
  purgeExpiredSecurityEvents(cutoff: string, batchLimit?: number): Promise<number>
}

export type RetentionOptions = {
  now?: number
  batchLimit?: number
  schedulerSecret?: string
  providedSecret?: string
}

export const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000
export const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000

export async function purgeExpiredData(
  database: RetentionDatabase,
  options: RetentionOptions = {},
): Promise<RetentionSummary> {
  // Enforce scheduler secret authentication if configured
  if (options.schedulerSecret) {
    if (!options.providedSecret || options.providedSecret !== options.schedulerSecret) {
      throw new ApiFailure(403, 'UNAUTHORIZED_RETENTION_CALL', 'Invalid or missing scheduler secret.')
    }
  }

  const now = options.now ?? Date.now()
  const tombstoneCutoff = new Date(now - THIRTY_DAYS_MS).toISOString()
  const operationsCutoff = new Date(now).toISOString()
  const conflictsCutoff = new Date(now).toISOString()
  const securityEventsCutoff = new Date(now).toISOString()
  const batchLimit = options.batchLimit ?? 1000

  // 1. Advance retention floors before purging tombstones to protect against cursor inconsistencies
  const floorsAdvanced = await database.advanceRetentionFloorBeforePurge(tombstoneCutoff)

  // 2. Purge 30-day expired tombstones
  const tombstonesPurged = await database.purgeExpiredTombstones(tombstoneCutoff, batchLimit)

  // 3. Purge expired operations (30 days)
  const operationsPurged = await database.purgeExpiredOperations(operationsCutoff, batchLimit)

  // 4. Purge expired conflicts (90 days)
  const conflictsPurged = await database.purgeExpiredConflicts(conflictsCutoff, batchLimit)

  // 5. Purge expired security events (90 days)
  const securityEventsPurged = await database.purgeExpiredSecurityEvents(securityEventsCutoff, batchLimit)

  return {
    purgedTombstones: tombstonesPurged,
    purgedOperations: operationsPurged,
    purgedConflicts: conflictsPurged,
    purgedSecurityEvents: securityEventsPurged,
    retentionFloorsAdvanced: floorsAdvanced,
    timestamp: new Date(now).toISOString(),
  }
}
