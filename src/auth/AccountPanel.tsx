import { useState, useEffect } from 'react'
import {
  Laptop,
  Smartphone,
  Globe,
  Trash2,
  Download,
  AlertTriangle,
  Check,
  RefreshCw,
  LogOut,
  Shield,
  Clock,
  ChevronRight,
  X,
} from 'lucide-react'
import { useTendIdentity } from './TendAuthProvider'
import type { DeviceSummary } from './types'
import { deviceIdFor } from '../sync/deviceIdentity'

export type AccountPanelProps = {
  supabaseUrl?: string
  onClose?: () => void
  onSignOut?: () => Promise<void>
}

export function AccountPanel({ supabaseUrl, onClose, onSignOut }: AccountPanelProps) {
  const identity = useTendIdentity()
  const [devices, setDevices] = useState<DeviceSummary[]>([])
  const [loadingDevices, setLoadingDevices] = useState(false)
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deletePending, setDeletePending] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const currentDeviceId = deviceIdFor()

  const fetchDevices = async () => {
    if (identity.status !== 'signedIn' || !supabaseUrl) return
    setLoadingDevices(true)
    setErrorMessage(null)
    try {
      const token = await identity.getAccessToken()
      if (!token) return
      const res = await fetch(`${supabaseUrl}/functions/v1/account/devices`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-device-id': currentDeviceId,
        },
      })
      if (res.ok) {
        const data = await res.json()
        setDevices(data)
      } else {
        // Fallback to local device info if backend not reachable
        setDevices([
          {
            deviceId: currentDeviceId,
            name: 'Current Browser Session',
            platform: 'desktop',
            appVersion: '1.1.14',
            createdAt: new Date().toISOString(),
            lastSeenAt: new Date().toISOString(),
            isCurrentDevice: true,
          },
        ])
      }
    } catch {
      setDevices([
        {
          deviceId: currentDeviceId,
          name: 'Current Browser Session',
          platform: 'desktop',
          appVersion: '1.1.14',
          createdAt: new Date().toISOString(),
          lastSeenAt: new Date().toISOString(),
          isCurrentDevice: true,
        },
      ])
    } finally {
      setLoadingDevices(false)
    }
  }

  useEffect(() => {
    if (identity.status === 'signedIn') {
      void fetchDevices()
    }
  }, [identity.status])

  const handleRevoke = async (deviceId: string) => {
    if (identity.status !== 'signedIn' || !supabaseUrl) return
    setRevokingId(deviceId)
    setErrorMessage(null)
    try {
      const token = await identity.getAccessToken()
      if (!token) return
      const res = await fetch(`${supabaseUrl}/functions/v1/account/devices/revoke`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ deviceId }),
      })
      if (res.ok) {
        setDevices((prev) => prev.filter((d) => d.deviceId !== deviceId))
        setStatusMessage('Device access revoked.')
        setTimeout(() => setStatusMessage(null), 3000)
      } else {
        setErrorMessage('Could not revoke device.')
      }
    } catch {
      setErrorMessage('Network error while revoking device.')
    } finally {
      setRevokingId(null)
    }
  }

  const handleExportData = async () => {
    setExporting(true)
    setErrorMessage(null)
    try {
      let exportData: unknown = null
      if (identity.status === 'signedIn' && supabaseUrl) {
        const token = await identity.getAccessToken()
        if (token) {
          const res = await fetch(`${supabaseUrl}/functions/v1/account/export`, {
            headers: { Authorization: `Bearer ${token}` },
          })
          if (res.ok) {
            exportData = await res.json()
          }
        }
      }
      if (!exportData) {
        // Fallback to client localStorage/IndexedDB snapshot
        const raw = localStorage.getItem('tend:app-state')
        exportData = {
          version: 1,
          exportedAt: new Date().toISOString(),
          source: 'local_storage',
          state: raw ? JSON.parse(raw) : null,
        }
      }
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const today = new Date().toISOString().slice(0, 10)
      a.href = url
      a.download = `tend-account-export-${today}.json`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      setStatusMessage('Data export downloaded.')
      setTimeout(() => setStatusMessage(null), 3000)
    } catch {
      setErrorMessage('Export failed. Please try again.')
    } finally {
      setExporting(false)
    }
  }

  const handleDeleteAccount = async () => {
    setDeletePending(true)
    setErrorMessage(null)
    try {
      if (identity.status === 'signedIn' && supabaseUrl) {
        const token = await identity.getAccessToken()
        if (token) {
          const res = await fetch(`${supabaseUrl}/functions/v1/account/delete`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
              'x-device-id': currentDeviceId,
            },
            body: JSON.stringify({ confirmation: 'DELETE' }),
          })
          if (!res.ok) {
            throw new Error('Server returned an error during deletion.')
          }
        }
      }
      if (onSignOut) {
        await onSignOut()
      } else if (identity.status === 'signedIn') {
        await identity.signOut()
      }
      setStatusMessage('Account and synced data permanently deleted.')
      if (onClose) onClose()
    } catch {
      setErrorMessage('Could not process deletion request. Please try again.')
    } finally {
      setDeletePending(false)
      setConfirmDelete(false)
    }
  }

  return (
    <div className="account-panel-container">
      <div className="account-panel-card">
        <header className="account-panel-header">
          <div>
            <span className="eyebrow">YOUR TEND ACCOUNT</span>
            <h2>Account & Device Management</h2>
          </div>
          {onClose && (
            <button className="icon-button" onClick={onClose} aria-label="Close panel">
              <X size={20} />
            </button>
          )}
        </header>

        {statusMessage && (
          <div className="account-alert success" role="status">
            <Check size={16} />
            <span>{statusMessage}</span>
          </div>
        )}

        {errorMessage && (
          <div className="account-alert error" role="alert">
            <AlertTriangle size={16} />
            <span>{errorMessage}</span>
          </div>
        )}

        <section className="account-section">
          <div className="account-user-card">
            <div className="account-avatar">
              <Shield size={24} />
            </div>
            <div className="account-user-details">
              <strong>{identity.status === 'signedIn' ? `Signed in (${identity.userId.slice(0, 12)}…)` : 'Guest Mode (Offline)'}</strong>
              <p>
                {identity.status === 'signedIn'
                  ? 'Your workspace automatically syncs across your verified devices.'
                  : 'Your data is strictly stored in local browser storage on this device.'}
              </p>
            </div>
            {identity.status === 'signedIn' && (
              <button
                className="outline account-signout-btn"
                onClick={onSignOut || identity.signOut}
              >
                <LogOut size={16} />
                Sign out
              </button>
            )}
          </div>
        </section>

        {identity.status === 'signedIn' && (
          <section className="account-section">
            <div className="account-section-heading">
              <div>
                <h3>Connected Devices</h3>
                <p>Manage the laptops, tablets, and phones synced with your account.</p>
              </div>
              <button
                className="icon-button"
                onClick={fetchDevices}
                disabled={loadingDevices}
                aria-label="Refresh devices"
              >
                <RefreshCw size={16} className={loadingDevices ? 'spin' : ''} />
              </button>
            </div>

            <div className="device-list">
              {devices.map((device) => (
                <div key={device.deviceId} className={`device-row ${device.isCurrentDevice ? 'current' : ''}`}>
                  <div className="device-icon">
                    {device.platform === 'desktop' ? <Laptop size={20} /> : <Globe size={20} />}
                  </div>
                  <div className="device-info">
                    <div className="device-title">
                      <strong>{device.name}</strong>
                      {device.isCurrentDevice && <span className="device-badge">This device</span>}
                    </div>
                    <small>
                      App v{device.appVersion} · Last active{' '}
                      {new Date(device.lastSeenAt).toLocaleDateString()}
                    </small>
                  </div>
                  {!device.isCurrentDevice && (
                    <button
                      className="text-button revoke-btn"
                      onClick={() => handleRevoke(device.deviceId)}
                      disabled={revokingId === device.deviceId}
                    >
                      {revokingId === device.deviceId ? 'Revoking…' : 'Revoke'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="account-section">
          <div className="account-section-heading">
            <div>
              <h3>Data Sovereignty & Export</h3>
              <p>Export your entire task history, notebook thoughts, and reviews as an open JSON file.</p>
            </div>
          </div>
          <button className="outline export-button" onClick={handleExportData} disabled={exporting}>
            <Download size={17} />
            {exporting ? 'Preparing export…' : 'Download Complete JSON Bundle'}
          </button>
        </section>

        {identity.status === 'signedIn' && (
          <section className="account-section danger-zone">
            <div className="account-section-heading">
              <div>
                <h3 className="danger-text">Delete Account</h3>
                <p>
                  Permanently erase your cloud account and all synced server records. Your local journal remains intact on this device until manually cleared.
                </p>
              </div>
            </div>

            {!confirmDelete ? (
              <button className="outline danger-btn" onClick={() => setConfirmDelete(true)}>
                <Trash2 size={16} />
                Request Account Deletion
              </button>
            ) : (
              <div className="delete-confirm-box">
                <p>
                  <strong>Are you sure?</strong> Cloud sync will be disconnected and all remote records will be permanently removed.
                </p>
                <div className="confirm-actions">
                  <button className="text-button" onClick={() => setConfirmDelete(false)}>
                    Cancel
                  </button>
                  <button className="danger-confirm-btn" onClick={handleDeleteAccount} disabled={deletePending}>
                    {deletePending ? 'Deleting…' : 'Yes, Delete Cloud Account'}
                  </button>
                </div>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  )
}
