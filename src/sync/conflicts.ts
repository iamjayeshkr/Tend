import type { JsonValue, RemoteRecord, SyncOperation } from './types'

export type ConflictReason =
  | 'same-field-change'
  | 'notebook-content-change'
  | 'remote-deleted'
  | 'restore-diverged'
  | 'append-only-diverged'

export type ConflictRecovery = {
  reason: ConflictReason
  preserveAsSibling: boolean
  base: RemoteRecord | null
  local: SyncOperation
  remote: RemoteRecord
}

export type PreservedConflict = ConflictRecovery & { conflictId: string }

export type MergeResult =
  | { kind: 'remote'; active: RemoteRecord; equivalent: boolean }
  | { kind: 'retry'; active: RemoteRecord; operation: SyncOperation }
  | { kind: 'preserve'; active: RemoteRecord; conflict: ConflictRecovery }

function stable(value: JsonValue | Record<string, JsonValue> | null): JsonValue | Record<string, JsonValue> | null {
  if (Array.isArray(value)) return value.map((item) => stable(item as JsonValue)) as JsonValue[]
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stable(child as JsonValue)]),
    ) as Record<string, JsonValue>
  }
  return value
}

function equal(
  left: Record<string, JsonValue> | null | undefined,
  right: Record<string, JsonValue> | null | undefined,
): boolean {
  return JSON.stringify(stable(left ?? null)) === JSON.stringify(stable(right ?? null))
}

function changedFields(base: RemoteRecord | null, current: RemoteRecord): Set<string> {
  if (current.deletedAt !== null) return new Set(['__deleted'])
  if (!base || base.deletedAt !== null || !base.data) {
    return new Set(['__restored', ...Object.keys(current.data ?? {})])
  }
  const fields = new Set([...Object.keys(base.data), ...Object.keys(current.data ?? {})])
  return new Set([...fields].filter((field) => (
    JSON.stringify(stable(base.data?.[field] as JsonValue))
    !== JSON.stringify(stable(current.data?.[field] as JsonValue))
  )))
}

function localChangedFields(base: RemoteRecord | null, local: SyncOperation): Set<string> {
  if (local.kind === 'delete') return new Set(['__deleted'])
  if (local.kind === 'patch') return new Set(local.changedFields ?? [])
  if (!base || base.deletedAt !== null) return new Set(['__restored', ...Object.keys(local.data ?? {})])
  return new Set([...Object.keys(base.data ?? {}), ...Object.keys(local.data ?? {})])
}

function equivalent(local: SyncOperation, remote: RemoteRecord): boolean {
  if (local.kind === 'delete') return remote.deletedAt !== null
  return remote.deletedAt === null && equal(local.data, remote.data)
}

function reasonFor(base: RemoteRecord | null, local: SyncOperation, remote: RemoteRecord): ConflictReason {
  if (remote.deletedAt !== null) return 'remote-deleted'
  if (base?.deletedAt !== null && local.kind === 'put') return 'restore-diverged'
  if (local.collection === 'ideas') return 'notebook-content-change'
  if (local.collection === 'activities') return 'append-only-diverged'
  return 'same-field-change'
}

/**
 * Resolves only from acknowledged server state and revisions. Client timestamps
 * are deliberately ignored and can never make an offline write win.
 */
export function resolveConflict(
  base: RemoteRecord | null | undefined,
  local: SyncOperation,
  remote: RemoteRecord,
): MergeResult {
  const acknowledgedBase = base ?? null
  if (local.collection !== remote.collection || local.recordId !== remote.recordId) {
    throw new Error('Conflict records must describe the same record.')
  }
  if (acknowledgedBase && (
    acknowledgedBase.collection !== local.collection || acknowledgedBase.recordId !== local.recordId
  )) {
    throw new Error('Conflict base must describe the same record.')
  }
  if (equivalent(local, remote)) return { kind: 'remote', active: remote, equivalent: true }

  const localFields = localChangedFields(acknowledgedBase, local)
  const remoteFields = changedFields(acknowledgedBase, remote)
  const overlaps = [...localFields].some((field) => remoteFields.has(field))
  if (
    local.kind === 'patch'
    && acknowledgedBase?.deletedAt === null
    && remote.deletedAt === null
    && !overlaps
  ) {
    const data = structuredClone(remote.data ?? {})
    for (const field of localFields) {
      const value = local.data?.[field]
      if (value === undefined) delete data[field]
      else data[field] = structuredClone(value)
    }
    return {
      kind: 'retry',
      active: remote,
      operation: {
        ...local,
        baseRevision: remote.revision,
        data,
        changedFields: [...localFields].sort((left, right) => left.localeCompare(right)),
      },
    }
  }

  const reason = reasonFor(acknowledgedBase, local, remote)
  return {
    kind: 'preserve',
    active: remote,
    conflict: {
      reason,
      preserveAsSibling: local.collection === 'ideas',
      base: acknowledgedBase,
      local: structuredClone(local),
      remote: structuredClone(remote),
    },
  }
}
