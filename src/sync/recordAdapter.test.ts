import { describe, expect, it } from 'vitest'

import { defaultState, type AppState } from '../core'
import { schema1ActiveTimerState, schema1CompleteState } from '../test-fixtures/schema1'
import { diffRecords, recordsToState, stateToRecords, type LocalRecord } from './recordAdapter'
import type { RemoteRecord } from './types'

function asRemote(records: Iterable<LocalRecord>): RemoteRecord[] {
  return [...records].map((record) => ({
    ...record,
    revision: 1,
    modifiedAt: '2026-10-14T04:30:00.000Z',
    deletedAt: null,
  }))
}

const metadata = {
  changedAt: '2026-10-14T04:30:00.000Z',
  operationId: (_key: string, index: number) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
}

describe('stateToRecords and recordsToState', () => {
  it('round-trips every synced field while preserving local-only fields from the base', () => {
    const state = schema1CompleteState()
    const records = stateToRecords(state)

    expect(records.size).toBe(21)
    expect(records.get('tasks:task-linked')?.recordId).toBe('task-linked')
    expect(records.get('reviews:2026-09-12')?.recordId).toBe('2026-09-12')
    expect(records.get('wakeLogs:2026-09-12')?.recordId).toBe('2026-09-12')
    expect(records.get('settings:focusMinutes')?.data).toEqual({ value: 25 })

    expect(recordsToState(state, asRemote(records.values()))).toEqual(state)
  })

  it('excludes active timers and device-private settings', () => {
    const state = schema1ActiveTimerState()
    const records = stateToRecords(state)
    const serialized = JSON.stringify([...records.values()])

    expect([...records.keys()].filter((key) => key.startsWith('settings:')).sort()).toEqual([
      'settings:breakMinutes',
      'settings:cooldownMinutes',
      'settings:earliestLogMinutesBefore',
      'settings:focusMinutes',
      'settings:logDeadline',
      'settings:name',
      'settings:sleep',
      'settings:theme',
      'settings:wake',
    ])
    expect(serialized).not.toContain('timer-active')
    expect(serialized).not.toContain('parentalPin')
    expect(serialized).not.toContain('restrictedPackages')
    expect(serialized).not.toContain('notifications')
    expect(serialized).not.toContain('wakeLockEnabled')
  })
})

describe('diffRecords', () => {
  it('emits deterministic sorted create, patch, and delete operations', () => {
    const previousState = schema1CompleteState()
    const nextState: AppState = structuredClone(previousState)
    nextState.tasks = nextState.tasks.filter((task) => task.id !== 'task-finished')
    nextState.tasks.find((task) => task.id === 'task-linked')!.done = true
    nextState.tasks.push({ id: 'task-new', title: 'New task', done: false, date: '2026-09-13', category: 'project' })

    const operations = diffRecords(stateToRecords(previousState), stateToRecords(nextState), metadata)

    expect(operations.map(({ recordId, kind }) => `${recordId}:${kind}`)).toEqual([
      'task-finished:delete',
      'task-linked:patch',
      'task-new:put',
    ])
    expect(operations[1]?.changedFields).toEqual(['done'])
    expect(operations.map((item) => item.operationId)).toEqual([
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002',
      '00000000-0000-4000-8000-000000000003',
    ])
  })

  it('emits one completion operation for one completed focus activity', () => {
    const before = defaultState()
    const after = structuredClone(before)
    after.activities.push({
      id: 'focus-completion', title: 'Read', category: 'study', start: 1, end: 2,
      createdAt: 1, modifiedAt: 2, source: 'timer',
    })

    const operations = diffRecords(stateToRecords(before), stateToRecords(after), metadata)
    expect(operations).toHaveLength(1)
    expect(operations[0]).toMatchObject({ collection: 'activities', recordId: 'focus-completion', kind: 'put' })
  })
})
