import { AlertCircle, CheckCircle2, Cloud, Download, LoaderCircle } from 'lucide-react'
import { useEffect, useRef } from 'react'

import type { GuestMigrationPreview } from './guestMigration'

export type GuestMigrationPhase = 'preview' | 'migrating' | 'error' | 'complete'

const labels = {
  tasks: 'tasks',
  routine: 'routine blocks',
  activities: 'activity entries',
  ideas: 'notebook entries',
  reviews: 'daily reviews',
  sets: 'workout sets',
  wakeLogs: 'wake logs',
  sleepLogs: 'sleep logs',
  settings: 'shared preferences',
} as const

export function GuestMigrationDialog({
  phase,
  preview,
  error,
  onConfirm,
  onCancel,
  onRetry,
  onFinish,
  onExportRecovery,
}: {
  phase: GuestMigrationPhase
  preview: GuestMigrationPreview
  error?: string
  onConfirm: () => void
  onCancel: () => void
  onRetry: () => void
  onFinish: () => void
  onExportRecovery: () => void
}) {
  const dialogRef = useRef<HTMLElement>(null)
  const cancelRef = useRef(onCancel)
  cancelRef.current = onCancel
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null
    document.body.style.overflow = 'hidden'
    dialogRef.current?.querySelector<HTMLElement>('button:not(:disabled)')?.focus()
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && phase !== 'migrating') cancelRef.current()
      if (event.key !== 'Tab') return
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled),[tabindex="0"]')
      if (!focusable?.length) return
      const first = focusable[0]!
      const last = focusable[focusable.length - 1]!
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.body.style.overflow = ''
      previousFocus?.focus()
    }
  }, [phase])

  const heading = phase === 'preview'
    ? 'Bring this journal with you'
    : phase === 'migrating'
      ? 'Moving your journal safely'
      : phase === 'error'
        ? 'Your guest journal is still safe'
        : 'Your journal is synced'
  const Icon = phase === 'migrating'
    ? LoaderCircle
    : phase === 'error'
      ? AlertCircle
      : phase === 'complete'
        ? CheckCircle2
        : Cloud

  return (
    <div className="modal-backdrop migration-backdrop">
      <section
        className="modal guest-migration-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="guest-migration-title"
        aria-busy={phase === 'migrating'}
        ref={dialogRef}
        tabIndex={-1}
      >
        <div className="migration-symbol" aria-hidden="true"><Icon size={25} /></div>
        <span className="eyebrow">SECURE CLOUD COPY</span>
        <h2 id="guest-migration-title">{heading}</h2>

        {phase === 'preview' && <>
          <p className="modal-intro">
            Tend found {preview.totalRecords} journal records on this device. Review the copy before anything moves.
          </p>
          <ul className="migration-counts" aria-label="Guest journal migration preview">
            {Object.entries(preview.counts).filter(([, count]) => count > 0).map(([collection, count]) => (
              <li key={collection}><strong>{count}</strong> {labels[collection as keyof typeof labels]}</li>
            ))}
          </ul>
          <p className="migration-note">
            Device locks, notification choices{preview.excluded.activeTimer ? ', and your running timer' : ''} stay on this device.
          </p>
          <button className="primary full" type="button" onClick={onConfirm}>Copy and verify my journal</button>
          <button className="text-button centered" type="button" onClick={onCancel}>Not now — keep both spaces separate</button>
        </>}

        {phase === 'migrating' && <>
          <p className="modal-intro">Tend is validating, copying, and checking every record. Keep this window open.</p>
          <div className="signout-safety" role="status">
            <LoaderCircle className="spin" aria-hidden="true" size={20} />
            <span>The original guest journal remains unchanged.</span>
          </div>
        </>}

        {phase === 'error' && <>
          <p className="form-error" role="alert">{error ?? 'The migration paused before verification finished.'}</p>
          <p className="modal-intro">You can retry with the same safe operation IDs or export the recovery copy.</p>
          <button className="primary full" type="button" onClick={onRetry}>Retry safely</button>
          <button className="outline full" type="button" onClick={onExportRecovery}>
            <Download aria-hidden="true" size={16} /> Export recovery copy
          </button>
          <button className="text-button centered" type="button" onClick={onCancel}>Keep using my guest journal for now</button>
        </>}

        {phase === 'complete' && <>
          <p className="modal-intro">Every migrated record was pulled back and verified. Your original guest copy remains available for recovery.</p>
          <button className="primary full" type="button" onClick={onFinish}>Continue to my journal</button>
        </>}
      </section>
    </div>
  )
}
