import { parseBackup, type AppState } from '../core'
import {
  LOCAL_RECOVERY_RETENTION_MS,
  type GuestMigrationCheckpoint,
  type LocalRepository,
  type MigrationExpectation,
} from '../data/localRepository'
import type { SyncGateway } from '../sync/gatewayClient'
import type { PreservedConflict } from '../sync/conflicts'
import {
  SHAREABLE_SETTING_KEYS,
  diffRecords,
  recordKey,
  recordsToState,
  stateToRecords,
  type LocalRecord,
} from '../sync/recordAdapter'
import type { JsonValue, RemoteRecord, SyncOperation, TendCollection } from '../sync/types'

export const RECOVERY_RETENTION_MS = LOCAL_RECOVERY_RETENTION_MS
const MIGRATION_BATCH_SIZE = 100

const collections: TendCollection[] = [
  'tasks', 'routine', 'activities', 'ideas', 'reviews', 'sets', 'wakeLogs', 'sleepLogs', 'settings',
]

export type GuestMigrationPreview = {
  counts: Record<TendCollection, number>
  totalRecords: number
  excluded: { activeTimer: boolean; settingKeys: string[] }
}

export type GuestMigrationResult = {
  status: 'complete'
  migrationId: string
  verifiedRecordCount: number
  sourceHash: string
}

export type RunGuestMigrationOptions = {
  guestState: AppState
  workspaceId: string
  deviceId: string
  repository: LocalRepository
  gateway: Pick<SyncGateway, 'validateMigration'>
  synchronize: () => Promise<void>
  migrationId?: () => string
  now?: () => number
}

export type ResumeGuestMigrationOptions = {
  workspaceId: string
  repository: LocalRepository
  synchronize: () => Promise<void>
  now?: () => number
}

export class GuestMigrationError extends Error {
  constructor(readonly code: string, message: string) {
    super(message)
    this.name = 'GuestMigrationError'
  }
}

function emptyCounts(): Record<TendCollection, number> {
  return Object.fromEntries(collections.map((collection) => [collection, 0])) as Record<TendCollection, number>
}

export function previewGuestMigration(input: AppState): GuestMigrationPreview {
  const state = parseBackup(JSON.stringify(input))
  const counts = emptyCounts()
  for (const record of stateToRecords(state).values()) counts[record.collection] += 1
  const allowlisted = new Set<string>(SHAREABLE_SETTING_KEYS)
  const settingKeys = Object.keys(state.settings)
    .filter((key) => !allowlisted.has(key))
    .sort((left, right) => left.localeCompare(right))
  return {
    counts,
    totalRecords: Object.values(counts).reduce((sum, count) => sum + count, 0),
    excluded: { activeTimer: state.timer !== null, settingKeys },
  }
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stable(child)]),
    )
  }
  return value
}

function canonical(value: unknown): string {
  return JSON.stringify(stable(value))
}

async function digest(value: unknown): Promise<string> {
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(value)))
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function stableOperationId(migrationId: string, key: string): Promise<string> {
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${migrationId}:${key}`))
  const bytes = new Uint8Array(buffer).slice(0, 16)
  bytes[6] = (bytes[6]! & 0x0f) | 0x40
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

async function sourceHash(records: ReadonlyMap<string, LocalRecord>): Promise<string> {
  return digest([...records.entries()].map(([key, record]) => [key, record.data]))
}

export async function guestMigrationSourceHash(input: AppState): Promise<string> {
  const state = parseBackup(JSON.stringify(input))
  return sourceHash(stateToRecords(state))
}

async function expectationsFor(
  records: ReadonlyMap<string, LocalRecord>,
  accountRecords: ReadonlyMap<string, LocalRecord>,
): Promise<MigrationExpectation[]> {
  return Promise.all([...records.entries()].map(async ([key, record]) => {
    const account = accountRecords.get(key)
    const fields = account
      ? Object.keys(record.data).filter((field) => canonical(record.data[field]) !== canonical(account.data[field]))
      : Object.keys(record.data)
    return {
      collection: record.collection,
      recordId: record.recordId,
      fieldHashes: Object.fromEntries(await Promise.all(
        fields.map(async (field) => [field, await digest(record.data[field])]),
      )),
    }
  }))
}

function migrationTarget(account: AppState, guestRecords: ReadonlyMap<string, LocalRecord>): AppState {
  const records: RemoteRecord[] = [...guestRecords.values()].map((record) => ({
    collection: record.collection,
    recordId: record.recordId,
    revision: 1,
    modifiedAt: '1970-01-01T00:00:00.000Z',
    deletedAt: null,
    data: structuredClone(record.data),
  }))
  return recordsToState(account, records)
}

async function migrationOperations(
  migrationId: string,
  account: AppState,
  target: AppState,
  changedAt: string,
  revisions: Record<string, number>,
): Promise<SyncOperation[]> {
  const provisional = diffRecords(stateToRecords(account), stateToRecords(target), {
    changedAt,
    operationId: (key) => key,
    baseRevisions: new Map(Object.entries(revisions)),
  })
  return Promise.all(provisional.map(async (operation) => ({
    ...operation,
    operationId: await stableOperationId(
      migrationId,
      recordKey(operation.collection, operation.recordId),
    ),
  })))
}

function migrationResult(checkpoint: GuestMigrationCheckpoint): GuestMigrationResult {
  return {
    status: 'complete',
    migrationId: checkpoint.migrationId,
    verifiedRecordCount: checkpoint.expectations.length,
    sourceHash: checkpoint.sourceHash,
  }
}

async function hashMatches(value: JsonValue | undefined, expectedHash: string): Promise<boolean> {
  return value !== undefined && await digest(value) === expectedHash
}

async function expectationMatches(
  expectation: MigrationExpectation,
  active: ReadonlyMap<string, LocalRecord>,
  conflicts: PreservedConflict[] | undefined,
): Promise<boolean> {
  const key = recordKey(expectation.collection, expectation.recordId)
  const activeRecord = active.get(key)
  if (activeRecord && (await Promise.all(
    Object.entries(expectation.fieldHashes).map(([field, hash]) => hashMatches(activeRecord.data[field], hash)),
  )).every(Boolean)) return true

  for (const conflict of conflicts ?? []) {
    if (conflict.local.collection !== expectation.collection || conflict.local.recordId !== expectation.recordId) continue
    if (!conflict.local.data) continue
    if ((await Promise.all(
      Object.entries(expectation.fieldHashes).map(([field, hash]) => hashMatches(conflict.local.data?.[field], hash)),
    )).every(Boolean)) return true
  }
  return false
}

async function verifyAndComplete(options: ResumeGuestMigrationOptions): Promise<GuestMigrationResult> {
  const metadata = await options.repository.loadMetadata(options.workspaceId)
  const checkpoint = metadata.migration
  if (!checkpoint) throw new GuestMigrationError('MIGRATION_NOT_FOUND', 'No guest migration is ready to resume.')
  const pending = await options.repository.readPending(options.workspaceId, 1)
  if (pending.length > 0) {
    throw new GuestMigrationError('MIGRATION_NOT_SYNCED', 'The guest migration is still waiting to synchronize.')
  }
  const state = await options.repository.loadWorkspace(options.workspaceId)
  if (!state) throw new GuestMigrationError('MIGRATION_NOT_VERIFIED', 'The synchronized account workspace is unavailable.')
  const active = stateToRecords(parseBackup(JSON.stringify(state)))
  for (const expectation of checkpoint.expectations) {
    if (!await expectationMatches(expectation, active, metadata.conflicts)) {
      throw new GuestMigrationError(
        'MIGRATION_NOT_VERIFIED',
        `A synchronized ${expectation.collection} record did not match its migration fingerprint.`,
      )
    }
  }
  const completedAt = (options.now ?? Date.now)()
  await options.repository.completeGuestMigration(options.workspaceId, completedAt)
  return migrationResult({ ...checkpoint, status: 'complete', completedAt })
}

export async function resumeGuestMigration(options: ResumeGuestMigrationOptions): Promise<GuestMigrationResult> {
  const checkpoint = (await options.repository.loadMetadata(options.workspaceId)).migration
  if (!checkpoint) throw new GuestMigrationError('MIGRATION_NOT_FOUND', 'No guest migration is ready to resume.')
  if (checkpoint.status === 'complete') return migrationResult(checkpoint)
  if (checkpoint.status !== 'prepared') {
    throw new GuestMigrationError('MIGRATION_NOT_PREPARED', 'The guest migration must finish validation before it can resume.')
  }
  await options.synchronize()
  return verifyAndComplete(options)
}

export async function runGuestMigration(options: RunGuestMigrationOptions): Promise<GuestMigrationResult> {
  const guest = parseBackup(JSON.stringify(options.guestState))
  const guestRecords = stateToRecords(guest)
  const hash = await guestMigrationSourceHash(guest)
  const existingMetadata = await options.repository.loadMetadata(options.workspaceId)
  const existing = existingMetadata.migration
  if (existing?.sourceHash === hash && existing.status === 'complete') return migrationResult(existing)
  if (existing?.status === 'prepared') {
    if (existing.sourceHash !== hash) {
      throw new GuestMigrationError('MIGRATION_IN_PROGRESS', 'Finish the existing guest migration before starting another.')
    }
    return resumeGuestMigration(options)
  }
  if ((await options.repository.readPending(options.workspaceId, 1)).length > 0) {
    throw new GuestMigrationError('ACCOUNT_SYNC_REQUIRED', 'Synchronize the account before migrating guest data.')
  }
  const account = await options.repository.loadWorkspace(options.workspaceId)
  if (!account) throw new GuestMigrationError('ACCOUNT_NOT_READY', 'The account workspace must be loaded before migration.')
  const migrationId = existing?.sourceHash === hash
    ? existing.migrationId
    : (options.migrationId ?? (() => crypto.randomUUID()))()
  const now = (options.now ?? Date.now)()
  const preview = previewGuestMigration(guest)
  const target = migrationTarget(parseBackup(JSON.stringify(account)), guestRecords)
  const expectations = await expectationsFor(guestRecords, stateToRecords(account))
  const validating: GuestMigrationCheckpoint = {
    migrationId,
    sourceHash: hash,
    status: 'validating',
    expectations,
    operationIds: [],
    counts: preview.counts,
    startedAt: existing?.sourceHash === hash ? existing.startedAt : now,
    recoveryExpiresAt: existing?.sourceHash === hash
      ? existing.recoveryExpiresAt
      : now + RECOVERY_RETENTION_MS,
  }
  const operations = await migrationOperations(
    migrationId,
    account,
    target,
    new Date(validating.startedAt).toISOString(),
    existingMetadata.revisions,
  )
  validating.operationIds = operations.map(({ operationId }) => operationId)
  await options.repository.saveMigrationCheckpoint(options.workspaceId, validating)

  const batches = operations.length === 0
    ? [[]]
    : Array.from({ length: Math.ceil(operations.length / MIGRATION_BATCH_SIZE) }, (_, index) => (
      operations.slice(index * MIGRATION_BATCH_SIZE, (index + 1) * MIGRATION_BATCH_SIZE)
    ))
  for (const batch of batches) {
    const result = await options.gateway.validateMigration({ deviceId: options.deviceId, dryRun: true, operations: batch })
    if (!result.accepted || result.recordCount !== batch.length || result.conflicts.length > 0) {
      throw new GuestMigrationError('MIGRATION_CONFLICT', 'The account changed while the migration was being prepared.')
    }
  }

  const prepared: GuestMigrationCheckpoint = { ...validating, status: 'prepared' }
  await options.repository.beginGuestMigration(
    options.workspaceId,
    account,
    target,
    operations,
    prepared,
    guest,
  )
  await options.synchronize()
  return verifyAndComplete(options)
}
