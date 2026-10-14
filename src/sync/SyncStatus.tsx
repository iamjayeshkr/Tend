import { AlertCircle, Check, Cloud, CloudOff, LoaderCircle } from 'lucide-react'

import type { SyncState } from './syncEngine'

export type SyncPresentation = {
  label: 'Saved on this device' | 'Syncing' | 'Synced' | 'Offline' | 'Needs attention'
  detail: string
  tone: 'local' | 'working' | 'synced' | 'offline' | 'attention'
}

export function syncPresentation(cloudEnabled: boolean, state: SyncState): SyncPresentation {
  if (!cloudEnabled) {
    return { label: 'Saved on this device', detail: 'Cloud sync is not connected.', tone: 'local' }
  }
  if (state.status === 'syncing') {
    return { label: 'Syncing', detail: 'Securely updating your other devices.', tone: 'working' }
  }
  if (state.status === 'offline') {
    return { label: 'Offline', detail: 'Changes stay safe here and will sync when you reconnect.', tone: 'offline' }
  }
  if (state.status === 'error') {
    return { label: 'Needs attention', detail: 'Your changes are safe on this device.', tone: 'attention' }
  }
  if (state.status === 'backoff' || state.pendingCount > 0) {
    return { label: 'Saved on this device', detail: 'Waiting to securely sync your latest changes.', tone: 'local' }
  }
  if (state.status === 'idle') {
    return { label: 'Synced', detail: 'Your latest changes are secure on your devices.', tone: 'synced' }
  }
  return { label: 'Saved on this device', detail: 'Your changes are stored locally.', tone: 'local' }
}

const icons = {
  local: Cloud,
  working: LoaderCircle,
  synced: Check,
  offline: CloudOff,
  attention: AlertCircle,
} as const

export function SyncStatus({ cloudEnabled, state, compact = false }: {
  cloudEnabled: boolean
  state: SyncState
  compact?: boolean
}) {
  const presentation = syncPresentation(cloudEnabled, state)
  const Icon = icons[presentation.tone]
  return (
    <span
      className={`sync-status is-${presentation.tone}${compact ? ' is-compact' : ''}`}
      role="status"
      aria-live="polite"
      title={presentation.detail}
    >
      <Icon aria-hidden="true" size={14} />
      <span>{presentation.label}</span>
    </span>
  )
}
