import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { SyncStatus, syncPresentation } from './SyncStatus'
import type { SyncState } from './syncEngine'

const state = (status: SyncState['status'], pendingCount = 0): SyncState => ({
  status, pendingCount, attempt: 0,
})

describe('SyncStatus', () => {
  it.each([
    [false, state('stopped'), 'Saved on this device'],
    [true, state('syncing'), 'Syncing'],
    [true, state('idle'), 'Synced'],
    [true, state('offline', 1), 'Offline'],
    [true, state('backoff', 1), 'Saved on this device'],
    [true, state('error', 1), 'Needs attention'],
  ] as const)('maps cloud=%s and %s to an honest accessible label', (cloudEnabled, syncState, label) => {
    expect(syncPresentation(cloudEnabled, syncState).label).toBe(label)
    expect(renderToStaticMarkup(<SyncStatus cloudEnabled={cloudEnabled} state={syncState} />)).toContain(label)
  })

  it('does not describe pending local work as fully synchronized', () => {
    expect(syncPresentation(true, state('idle', 2)).label).toBe('Saved on this device')
  })
})
