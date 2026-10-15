import { describe, expect, it } from 'vitest'

import { resolveConflict } from './conflicts'
import { diffRecords, stateToRecords } from './recordAdapter'
import { defaultState } from '../core'
import type { RemoteRecord, SyncOperation, TendCollection } from './types'

const modifiedAt = '2026-10-14T04:30:00.000Z'

function remote(
  collection: TendCollection,
  recordId: string,
  revision: number,
  data: Record<string, any> | null,
): RemoteRecord {
  return { collection, recordId, revision, modifiedAt, deletedAt: data === null ? modifiedAt : null, data }
}

function operation(overrides: Partial<SyncOperation> = {}): SyncOperation {
  return {
    operationId: '00000000-0000-4000-8000-000000000301',
    collection: 'tasks', recordId: 'task-one', kind: 'patch', baseRevision: 1,
    changedAt: modifiedAt,
    changedFields: ['title'],
    data: { title: 'Local title', done: false, date: '2026-10-14', category: 'work' },
    ...overrides,
  }
}

describe('resolveConflict', () => {
  it('retries a disjoint field merge against the remote revision', () => {
    const base = remote('tasks', 'task-one', 1, {
      title: 'Base title', done: false, date: '2026-10-14', category: 'work',
    })
    const current = remote('tasks', 'task-one', 2, {
      title: 'Base title', done: true, date: '2026-10-14', category: 'work',
    })

    expect(resolveConflict(base, operation(), current)).toMatchObject({
      kind: 'retry',
      operation: {
        baseRevision: 2,
        changedFields: ['title'],
        data: { title: 'Local title', done: true, date: '2026-10-14', category: 'work' },
      },
    })
  })

  it('preserves a same-field local alternative instead of overwriting it', () => {
    const base = remote('tasks', 'task-one', 1, {
      title: 'Base title', done: false, date: '2026-10-14', category: 'work',
    })
    const current = remote('tasks', 'task-one', 2, {
      title: 'Remote title', done: false, date: '2026-10-14', category: 'work',
    })

    expect(resolveConflict(base, operation(), current)).toMatchObject({
      kind: 'preserve',
      conflict: { reason: 'same-field-change', preserveAsSibling: false },
    })
  })

  it('marks concurrent notebook content as a visible sibling recovery copy', () => {
    const base = remote('ideas', 'idea-one', 3, {
      title: 'Base', text: 'Base body', kind: 'idea', status: 'unexplored', createdAt: 1,
    })
    const local = operation({
      collection: 'ideas', recordId: 'idea-one', baseRevision: 3,
      changedFields: ['text'],
      data: { title: 'Base', text: 'Local body', kind: 'idea', status: 'unexplored', createdAt: 1 },
    })
    const current = remote('ideas', 'idea-one', 4, {
      title: 'Base', text: 'Remote body', kind: 'idea', status: 'unexplored', createdAt: 1,
    })

    expect(resolveConflict(base, local, current)).toMatchObject({
      kind: 'preserve',
      conflict: { reason: 'notebook-content-change', preserveAsSibling: true },
    })
  })

  it('does not resurrect a remote tombstone from a stale offline update', () => {
    const base = remote('tasks', 'task-one', 1, {
      title: 'Base title', done: false, date: '2026-10-14', category: 'work',
    })
    const tombstone = remote('tasks', 'task-one', 2, null)
    expect(resolveConflict(base, operation(), tombstone)).toMatchObject({
      kind: 'preserve', conflict: { reason: 'remote-deleted' }, active: tombstone,
    })
  })

  it('preserves an explicit restore when a newer remote version already exists', () => {
    const deletedBase = remote('ideas', 'idea-one', 4, null)
    const restore = operation({
      collection: 'ideas', recordId: 'idea-one', kind: 'put', baseRevision: 4,
      changedFields: undefined,
      data: { title: 'Restored', text: 'Recovered text', kind: 'idea', status: 'unexplored', createdAt: 1 },
    })
    const newer = remote('ideas', 'idea-one', 5, {
      title: 'Remote restore', text: 'Other recovery', kind: 'idea', status: 'unexplored', createdAt: 1,
    })
    expect(resolveConflict(deletedBase, restore, newer)).toMatchObject({
      kind: 'preserve', conflict: { reason: 'restore-diverged', preserveAsSibling: true },
    })
  })

  it('treats identical append-only activity retries as one record', () => {
    const data = {
      title: 'Focus', category: 'work', start: 1, end: 2, createdAt: 2, modifiedAt: 2, source: 'timer',
    }
    const local = operation({
      collection: 'activities', recordId: 'session-one', kind: 'put', baseRevision: 0,
      changedFields: undefined, data,
    })
    expect(resolveConflict(null, local, remote('activities', 'session-one', 1, data))).toMatchObject({
      kind: 'remote', equivalent: true,
    })
  })

  it('keeps settings independent per key and log records independent per date', () => {
    const previous = defaultState()
    const next = structuredClone(previous)
    next.settings.theme = 'dark'
    next.settings.focusMinutes = 45
    next.settings.parentalPin = 'device-only-secret'
    next.wakeLogs['2026-10-14'] = 100
    next.wakeLogs['2026-10-15'] = 200
    const operations = diffRecords(stateToRecords(previous), stateToRecords(next), {
      changedAt: modifiedAt,
      operationId: (_key, index) => `00000000-0000-4000-8000-${String(400 + index).padStart(12, '0')}`,
    })

    expect(operations.map(({ collection, recordId }) => `${collection}:${recordId}`)).toEqual([
      'settings:focusMinutes', 'settings:theme', 'wakeLogs:2026-10-14', 'wakeLogs:2026-10-15',
    ])
    expect(JSON.stringify(operations)).not.toContain('device-only-secret')
  })
})
