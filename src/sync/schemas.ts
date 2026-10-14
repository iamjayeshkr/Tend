import { z } from 'zod'

import type {
  ApiError,
  DeviceRegistration,
  PullRequest,
  PullResponse,
  PushRequest,
  PushResponse,
  RemoteRecord,
  SyncOperation,
  TendCollection,
  ValidateMigrationRequest,
  ValidateMigrationResponse,
} from './types.ts'

export const TEND_COLLECTIONS = [
  'tasks',
  'routine',
  'activities',
  'ideas',
  'reviews',
  'sets',
  'wakeLogs',
  'sleepLogs',
  'settings',
] as const satisfies readonly TendCollection[]

const MAX_DEPTH = 10
const categories = ['study', 'work', 'project', 'exercise', 'rest', 'life'] as const
const collectionSchema = z.enum(TEND_COLLECTIONS)
const uuidSchema = z.string().uuid()
const timestampSchema = z.string().datetime({ offset: true })
const safeRecordIdSchema = z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/, 'Invalid record id')
const clockSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Invalid time')
const finiteTimestampSchema = z.number().finite().nonnegative().max(8_640_000_000_000_000)

const calendarDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date').refine((value) => {
  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(Date.UTC(year!, month! - 1, day!))
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month! - 1 && parsed.getUTCDate() === day
}, 'Invalid date')

const intervalSchema = z.strictObject({ start: finiteTimestampSchema, end: finiteTimestampSchema }).refine(
  ({ start, end }) => end >= start,
  'Interval end must not precede start',
)

const payloadSchemas: Record<TendCollection, z.ZodType<Record<string, unknown>>> = {
  tasks: z.strictObject({
    title: z.string().trim().min(1).max(1_000),
    done: z.boolean(),
    date: calendarDateSchema,
    category: z.enum(categories),
  }),
  routine: z.strictObject({
    title: z.string().trim().min(1).max(500),
    start: clockSchema,
    end: clockSchema,
    category: z.enum(categories),
  }),
  activities: z.strictObject({
    title: z.string().trim().min(1).max(1_000),
    category: z.enum(categories),
    start: finiteTimestampSchema,
    end: finiteTimestampSchema,
    value: z.number().finite().nonnegative().max(1_000_000_000).optional(),
    unit: z.string().max(10_000).optional(),
    note: z.string().max(10_000).optional(),
    outcome: z.string().max(10_000).optional(),
    createdAt: finiteTimestampSchema,
    modifiedAt: finiteTimestampSchema,
    source: z.enum(['manual', 'timer', 'automatic']),
    intervals: z.array(intervalSchema).max(10_000).optional(),
    missionId: safeRecordIdSchema.optional(),
    timingApproximate: z.boolean().optional(),
  }).refine(({ start, end }) => end >= start, 'Activity end must not precede start'),
  ideas: z.strictObject({
    text: z.string().max(20_000),
    kind: z.enum(['idea', 'question']),
    status: z.enum(['unexplored', 'researching', 'answered']),
    createdAt: finiteTimestampSchema,
    title: z.string().max(160).optional(),
    modifiedAt: finiteTimestampSchema.optional(),
    pinned: z.boolean().optional(),
  }).refine(({ text, title }) => Boolean(text.trim() || title?.trim()), 'Notebook entry must not be empty'),
  reviews: z.strictObject({
    mood: z.number().int().min(1).max(5),
    win: z.string().max(10_000),
    lesson: z.string().max(10_000),
    tomorrow: z.string().max(10_000),
  }),
  sets: z.strictObject({
    exercise: z.string().trim().min(1).max(500),
    weight: z.number().finite().nonnegative().max(10_000),
    reps: z.number().int().min(1).max(100_000),
    createdAt: finiteTimestampSchema,
  }),
  wakeLogs: z.strictObject({ timestamp: finiteTimestampSchema }),
  sleepLogs: z.strictObject({ timestamp: finiteTimestampSchema }),
  settings: z.strictObject({ value: z.union([z.string(), z.number().finite(), z.boolean()]) }),
}

const shareableSettingSchemas = {
  name: z.string().max(100),
  wake: clockSchema,
  sleep: clockSchema,
  focusMinutes: z.number().int().min(1).max(1_440),
  breakMinutes: z.number().int().min(1).max(1_440),
  theme: z.enum(['light', 'dark']),
  cooldownMinutes: z.number().int().min(0).max(1_440),
  logDeadline: clockSchema,
  earliestLogMinutesBefore: z.number().int().min(0).max(360),
} as const

function assertStructuralDepth(value: unknown, depth = 0, seen = new Set<object>()): void {
  if (depth > MAX_DEPTH) throw new Error('Request nesting is too deep')
  if (!value || typeof value !== 'object') return
  if (seen.has(value as object)) throw new Error('Request contains a cycle')
  seen.add(value as object)
  for (const child of Array.isArray(value) ? value : Object.values(value as Record<string, unknown>)) {
    assertStructuralDepth(child, depth + 1, seen)
  }
  seen.delete(value as object)
}

function validateRecordIdentity(collection: TendCollection, recordId: string): string {
  if (collection === 'reviews' || collection === 'wakeLogs' || collection === 'sleepLogs') {
    return calendarDateSchema.parse(recordId)
  }
  if (collection === 'settings') {
    const schema = shareableSettingSchemas[recordId as keyof typeof shareableSettingSchemas]
    if (!schema) throw new Error('Setting is not shareable')
    return recordId
  }
  return safeRecordIdSchema.parse(recordId)
}

function parseRecordData(
  collection: TendCollection,
  recordId: string,
  value: unknown,
): Record<string, unknown> {
  const parsed = payloadSchemas[collection].parse(value)
  if (collection === 'settings') {
    const schema = shareableSettingSchemas[recordId as keyof typeof shareableSettingSchemas]
    if (!schema) throw new Error('Setting is not shareable')
    schema.parse(parsed.value)
  }
  return parsed
}

const operationEnvelopeSchema = z.strictObject({
  operationId: uuidSchema,
  collection: collectionSchema,
  recordId: z.string(),
  kind: z.enum(['put', 'patch', 'delete']),
  baseRevision: z.number().int().nonnegative(),
  changedAt: timestampSchema,
  data: z.unknown().optional(),
  changedFields: z.array(z.string().min(1).max(100)).max(100).optional(),
  requestHash: z.string().regex(/^[a-f0-9]{64}$/i, 'Invalid request hash').optional(),
})

export function parseSyncOperation(value: unknown): SyncOperation {
  assertStructuralDepth(value)
  const operation = operationEnvelopeSchema.parse(value)
  const recordId = validateRecordIdentity(operation.collection, operation.recordId)
  if (operation.kind === 'delete') {
    if (operation.data !== undefined || operation.changedFields !== undefined) {
      throw new Error('Delete operations must not include record data')
    }
    return { ...operation, recordId } as SyncOperation
  }
  if (operation.data === undefined) throw new Error('Put and patch operations require record data')
  const data = parseRecordData(operation.collection, recordId, operation.data)
  if (operation.kind === 'patch' && (!operation.changedFields || operation.changedFields.length === 0)) {
    throw new Error('Patch operations require changed fields')
  }
  return { ...operation, recordId, data } as SyncOperation
}

const deviceRegistrationSchema = z.strictObject({
  deviceId: uuidSchema,
  name: z.string().trim().min(1).max(100),
  platform: z.enum(['web', 'desktop']),
  appVersion: z.string().trim().min(1).max(40),
})

export function parseDeviceRegistration(value: unknown): DeviceRegistration {
  assertStructuralDepth(value)
  return deviceRegistrationSchema.parse(value)
}

export function parsePushRequest(value: unknown): PushRequest {
  assertStructuralDepth(value)
  const request = z.strictObject({
    deviceId: uuidSchema,
    operations: z.array(z.unknown()).max(100, 'At most 100 operations are allowed'),
  }).parse(value)
  return { deviceId: request.deviceId, operations: request.operations.map(parseSyncOperation) }
}

const remoteRecordEnvelopeSchema = z.strictObject({
  collection: collectionSchema,
  recordId: z.string(),
  revision: z.number().int('Revision must be an integer').positive(),
  modifiedAt: timestampSchema,
  deletedAt: timestampSchema.nullable(),
  data: z.unknown().nullable(),
})

export function parseRemoteRecord(value: unknown): RemoteRecord {
  assertStructuralDepth(value)
  const record = remoteRecordEnvelopeSchema.parse(value)
  const recordId = validateRecordIdentity(record.collection, record.recordId)
  if (record.deletedAt === null && record.data === null) throw new Error('Live records require data')
  if (record.deletedAt !== null && record.data !== null) throw new Error('Deleted records must not expose data')
  const data = record.data === null ? null : parseRecordData(record.collection, recordId, record.data)
  return { ...record, recordId, data } as RemoteRecord
}

export function parsePushResponse(value: unknown): PushResponse {
  assertStructuralDepth(value)
  const response = z.strictObject({
    results: z.array(z.strictObject({
      operationId: uuidSchema,
      status: z.enum(['applied', 'duplicate', 'conflict']),
      revision: z.number().int().positive().optional(),
      record: z.unknown().optional(),
      conflictId: uuidSchema.optional(),
    })).max(100),
    cursor: z.string().min(1).max(512).optional(),
  }).parse(value)
  return {
    ...response,
    results: response.results.map((result) => ({
      ...result,
      ...(result.record === undefined ? {} : { record: parseRemoteRecord(result.record) }),
    })),
  } as PushResponse
}

export function parsePullRequest(value: unknown): PullRequest {
  assertStructuralDepth(value)
  return z.strictObject({
    deviceId: uuidSchema,
    cursor: z.string().min(1).max(512).optional(),
    limit: z.number().int().min(1).max(500).default(100),
  }).parse(value)
}

export function parsePullResponse(value: unknown): PullResponse {
  assertStructuralDepth(value)
  const response = z.strictObject({
    records: z.array(z.unknown()).max(500),
    cursor: z.string().min(1).max(512),
    hasMore: z.boolean(),
  }).parse(value)
  return { ...response, records: response.records.map(parseRemoteRecord) }
}

export function parseValidateMigrationRequest(value: unknown): ValidateMigrationRequest {
  assertStructuralDepth(value)
  const request = z.strictObject({
    deviceId: uuidSchema,
    dryRun: z.literal(true),
    operations: z.array(z.unknown()).max(100),
  }).parse(value)
  return { ...request, operations: request.operations.map(parseSyncOperation) }
}

export function parseValidateMigrationResponse(value: unknown): ValidateMigrationResponse {
  assertStructuralDepth(value)
  return z.strictObject({
    accepted: z.boolean(),
    recordCount: z.number().int().nonnegative(),
    conflicts: z.array(z.strictObject({
      collection: collectionSchema,
      recordId: safeRecordIdSchema,
      reason: z.string().min(1).max(500),
    })).max(1_000),
  }).parse(value)
}

export function parseApiError(value: unknown): ApiError {
  assertStructuralDepth(value)
  return z.strictObject({
    code: z.string().regex(/^[A-Z][A-Z0-9_]{1,63}$/),
    message: z.string().min(1).max(500),
    requestId: z.string().min(1).max(100),
    retryAfterSeconds: z.number().int().nonnegative().max(86_400).optional(),
  }).parse(value)
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stableValue(child)]),
    )
  }
  return value
}

export function canonicalOperation(operation: SyncOperation): string {
  const { requestHash: _requestHash, ...canonical } = operation
  return JSON.stringify(stableValue(canonical))
}
