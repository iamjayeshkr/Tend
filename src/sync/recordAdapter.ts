import {
  parseBackup,
  type Activity,
  type AppState,
  type Idea,
  type Review,
  type RoutineBlock,
  type Settings,
  type Task,
  type WorkoutSet,
} from '../core'
import { parseRemoteRecord } from './schemas'
import type { JsonValue, RemoteRecord, SyncOperation, TendCollection } from './types'

export type LocalRecord = {
  collection: TendCollection
  recordId: string
  data: Record<string, JsonValue>
}

export type DiffMetadata = {
  changedAt: string
  operationId: (recordKey: string, index: number) => string
  baseRevisions?: ReadonlyMap<string, number>
}

const shareableSettings = [
  'name',
  'wake',
  'sleep',
  'focusMinutes',
  'breakMinutes',
  'theme',
  'cooldownMinutes',
  'logDeadline',
  'earliestLogMinutesBefore',
] as const satisfies readonly (keyof Settings)[]

export function recordKey(collection: TendCollection, recordId: string): string {
  return `${collection}:${recordId}`
}

function jsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function payloadWithout<T extends Record<string, unknown>>(value: T, keys: string[]): Record<string, JsonValue> {
  return Object.fromEntries(
    Object.entries(jsonClone(value)).filter(([key]) => !keys.includes(key)),
  ) as Record<string, JsonValue>
}

export function stateToRecords(input: AppState): Map<string, LocalRecord> {
  const state = parseBackup(JSON.stringify(input))
  const records: LocalRecord[] = []
  const add = (collection: TendCollection, recordId: string, data: Record<string, JsonValue>) => {
    records.push({ collection, recordId, data })
  }

  for (const item of state.tasks) add('tasks', item.id, payloadWithout(item as unknown as Record<string, unknown>, ['id']))
  for (const item of state.routine) add('routine', item.id, payloadWithout(item as unknown as Record<string, unknown>, ['id']))
  for (const item of state.activities) add('activities', item.id, payloadWithout(item as unknown as Record<string, unknown>, ['id']))
  for (const item of state.ideas) add('ideas', item.id, payloadWithout(item as unknown as Record<string, unknown>, ['id']))
  for (const item of state.reviews) add('reviews', item.date, payloadWithout(item as unknown as Record<string, unknown>, ['date']))
  for (const item of state.sets) add('sets', item.id, payloadWithout(item as unknown as Record<string, unknown>, ['id']))
  for (const [date, timestamp] of Object.entries(state.wakeLogs)) add('wakeLogs', date, { timestamp })
  for (const [date, timestamp] of Object.entries(state.sleepLogs)) add('sleepLogs', date, { timestamp })
  for (const key of shareableSettings) add('settings', key, { value: state.settings[key] as JsonValue })

  return new Map(
    records
      .map((record) => [recordKey(record.collection, record.recordId), record] as const)
      .sort(([left], [right]) => left.localeCompare(right)),
  )
}

function upsertById<T extends { id: string }>(rows: T[], value: T): T[] {
  const index = rows.findIndex((row) => row.id === value.id)
  if (index < 0) return [...rows, value]
  const next = [...rows]
  next[index] = value
  return next
}

function upsertReview(rows: Review[], value: Review): Review[] {
  const index = rows.findIndex((row) => row.date === value.date)
  if (index < 0) return [...rows, value]
  const next = [...rows]
  next[index] = value
  return next
}

export function recordsToState(base: AppState, records: Iterable<RemoteRecord>): AppState {
  const next = parseBackup(JSON.stringify(base))
  for (const untrusted of records) {
    const record = parseRemoteRecord(untrusted)
    const deleted = record.deletedAt !== null
    if (record.collection === 'tasks') {
      next.tasks = deleted
        ? next.tasks.filter((item) => item.id !== record.recordId)
        : upsertById(next.tasks, { id: record.recordId, ...record.data } as Task)
    } else if (record.collection === 'routine') {
      next.routine = deleted
        ? next.routine.filter((item) => item.id !== record.recordId)
        : upsertById(next.routine, { id: record.recordId, ...record.data } as RoutineBlock)
    } else if (record.collection === 'activities') {
      next.activities = deleted
        ? next.activities.filter((item) => item.id !== record.recordId)
        : upsertById(next.activities, { id: record.recordId, ...record.data } as Activity)
    } else if (record.collection === 'ideas') {
      next.ideas = deleted
        ? next.ideas.filter((item) => item.id !== record.recordId)
        : upsertById(next.ideas, { id: record.recordId, ...record.data } as Idea)
    } else if (record.collection === 'reviews') {
      next.reviews = deleted
        ? next.reviews.filter((item) => item.date !== record.recordId)
        : upsertReview(next.reviews, { date: record.recordId, ...record.data } as Review)
    } else if (record.collection === 'sets') {
      next.sets = deleted
        ? next.sets.filter((item) => item.id !== record.recordId)
        : upsertById(next.sets, { id: record.recordId, ...record.data } as WorkoutSet)
    } else if (record.collection === 'wakeLogs' || record.collection === 'sleepLogs') {
      const target = record.collection === 'wakeLogs' ? next.wakeLogs : next.sleepLogs
      if (deleted) delete target[record.recordId]
      else target[record.recordId] = record.data!.timestamp as number
    } else if (record.collection === 'settings' && !deleted) {
      const key = record.recordId as (typeof shareableSettings)[number]
      ;(next.settings as unknown as Record<string, JsonValue>)[key] = record.data!.value
    }
  }
  return parseBackup(JSON.stringify(next))
}

function stableValue(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => [key, stableValue(child)]),
    )
  }
  return value
}

function equal(left: JsonValue | undefined, right: JsonValue | undefined): boolean {
  return JSON.stringify(left === undefined ? null : stableValue(left)) === JSON.stringify(right === undefined ? null : stableValue(right))
}

export function diffRecords(
  previous: ReadonlyMap<string, LocalRecord>,
  next: ReadonlyMap<string, LocalRecord>,
  metadata: DiffMetadata,
): SyncOperation[] {
  const keys = [...new Set([...previous.keys(), ...next.keys()])].sort((left, right) => left.localeCompare(right))
  const operations: SyncOperation[] = []
  for (const key of keys) {
    const before = previous.get(key)
    const after = next.get(key)
    if (before && after && equal(before.data, after.data)) continue
    const source = after ?? before!
    const index = operations.length
    const common = {
      operationId: metadata.operationId(key, index),
      collection: source.collection,
      recordId: source.recordId,
      baseRevision: metadata.baseRevisions?.get(key) ?? 0,
      changedAt: metadata.changedAt,
    }
    if (!after) {
      operations.push({ ...common, kind: 'delete' })
      continue
    }
    if (!before) {
      operations.push({ ...common, kind: 'put', data: jsonClone(after.data) })
      continue
    }
    const changedFields = [...new Set([...Object.keys(before.data), ...Object.keys(after.data)])]
      .filter((field) => !equal(before.data[field], after.data[field]))
      .sort((left, right) => left.localeCompare(right))
    operations.push({ ...common, kind: 'patch', data: jsonClone(after.data), changedFields })
  }
  return operations
}
