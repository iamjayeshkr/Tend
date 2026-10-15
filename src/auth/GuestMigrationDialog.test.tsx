import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { GuestMigrationDialog } from './GuestMigrationDialog'
import type { GuestMigrationPreview } from './guestMigration'

const preview: GuestMigrationPreview = {
  counts: {
    tasks: 2, routine: 1, activities: 0, ideas: 3, reviews: 0,
    sets: 0, wakeLogs: 1, sleepLogs: 1, settings: 9,
  },
  totalRecords: 17,
  excluded: { activeTimer: true, settingKeys: ['parentalPin', 'notifications'] },
}

describe('GuestMigrationDialog', () => {
  it.each([
    ['preview', 'Bring this journal with you'],
    ['migrating', 'Moving your journal safely'],
    ['error', 'Your guest journal is still safe'],
    ['complete', 'Your journal is synced'],
  ] as const)('renders the %s state accessibly', (phase, heading) => {
    const html = renderToStaticMarkup(<GuestMigrationDialog
      phase={phase}
      preview={preview}
      error={phase === 'error' ? 'The connection paused.' : undefined}
      onConfirm={vi.fn()}
      onCancel={vi.fn()}
      onRetry={vi.fn()}
      onFinish={vi.fn()}
      onExportRecovery={vi.fn()}
    />)
    expect(html).toContain('role="dialog"')
    expect(html).toContain(heading)
    if (phase === 'preview') expect(html).toContain('notebook entries')
  })
})
