import { useCallback, useEffect, useMemo, useState } from 'react'
import { useReverification } from '@clerk/react'
import {
  AlertTriangle,
  Check,
  Download,
  Globe,
  Laptop,
  LogOut,
  RefreshCw,
  Shield,
  X,
} from 'lucide-react'

import { deviceIdFor } from '../sync/deviceIdentity'
import {
  AccountRequestError,
  createAccountClient,
  parseAccountExportBundle,
  parseDeviceSummaries,
} from './accountClient'
import { useTendIdentity } from './TendAuthProvider'
import type { DeviceSummary, TendIdentity } from './types'

export type AccountPanelProps = {
  supabaseUrl?: string
  onClose?: () => void
  onSignOut?: () => Promise<void>
}

type SignedInIdentity = Extract<TendIdentity, { status: 'signedIn' }>

function isReverificationCancelled(error: unknown): boolean {
  return Boolean(
    error && typeof error === 'object' && 'code' in error &&
    (error as { code?: unknown }).code === 'reverification_cancelled',
  )
}

function errorCopy(error: unknown, fallback: string): string {
  if (isReverificationCancelled(error)) return 'Verification was cancelled. No account changes were made.'
  if (error instanceof AccountRequestError) return error.message
  return fallback
}

function downloadExport(bundle: ReturnType<typeof parseAccountExportBundle>): void {
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `tend-account-export-${new Date().toISOString().slice(0, 10)}.json`
  link.rel = 'noopener'
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1_000)
}

function SignedInAccountPanel({
  identity,
  supabaseUrl,
  onClose,
  onSignOut,
}: AccountPanelProps & { identity: SignedInIdentity; supabaseUrl: string }) {
  const [devices, setDevices] = useState<DeviceSummary[]>([])
  const [loadingDevices, setLoadingDevices] = useState(false)
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const currentDeviceId = useMemo(() => deviceIdFor(), [])
  const client = useMemo(() => createAccountClient({
    baseUrl: new URL('/functions/v1/account', supabaseUrl).toString(),
    deviceId: currentDeviceId,
    getAccessToken: identity.getAccessToken,
  }), [currentDeviceId, identity.getAccessToken, supabaseUrl])

  const requestRevocation = useReverification((deviceId: string) => client.request('/devices/revoke', {
    method: 'POST',
    body: { deviceId },
  }))
  const requestExport = useReverification(() => client.request('/export'))

  const fetchDevices = useCallback(async () => {
    setLoadingDevices(true)
    setErrorMessage(null)
    try {
      const response = await client.request('/devices')
      setDevices(parseDeviceSummaries(await response.json()))
    } catch (error) {
      setDevices([])
      setErrorMessage(errorCopy(error, 'Could not load connected devices.'))
    } finally {
      setLoadingDevices(false)
    }
  }, [client])

  useEffect(() => {
    void fetchDevices()
  }, [fetchDevices])

  const handleRevoke = async (deviceId: string) => {
    setRevokingId(deviceId)
    setErrorMessage(null)
    setStatusMessage(null)
    try {
      const result = await requestRevocation(deviceId) as unknown
      if (!result || typeof result !== 'object' || Array.isArray(result) ||
          (result as Record<string, unknown>).success !== true ||
          (result as Record<string, unknown>).revokedDeviceId !== deviceId ||
          Object.keys(result).some((key) => !['success', 'revokedDeviceId'].includes(key))) {
        throw new AccountRequestError(502, 'INVALID_RESPONSE', 'The account service returned an invalid response.')
      }
      setDevices((previous) => previous.filter((device) => device.deviceId !== deviceId))
      setStatusMessage('Device access revoked.')
    } catch (error) {
      setErrorMessage(errorCopy(error, 'Could not revoke this device.'))
    } finally {
      setRevokingId(null)
    }
  }

  const handleExportData = async () => {
    setExporting(true)
    setErrorMessage(null)
    setStatusMessage(null)
    try {
      const bundle = parseAccountExportBundle(await requestExport())
      downloadExport(bundle)
      setStatusMessage('Secure account export downloaded.')
    } catch (error) {
      setErrorMessage(errorCopy(error, 'Export failed. Please try again.'))
    } finally {
      setExporting(false)
    }
  }

  const handleSignOut = async () => {
    setSigningOut(true)
    setErrorMessage(null)
    try {
      await (onSignOut ? onSignOut() : identity.signOut())
    } catch {
      setErrorMessage('Sign out could not be completed. Please try again.')
      setSigningOut(false)
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
            <div className="account-avatar"><Shield size={24} /></div>
            <div className="account-user-details">
              <strong>{`Signed in (${identity.userId.slice(0, 12)}…)`}</strong>
              <p>Your encrypted session can sync this workspace across your verified devices.</p>
            </div>
            <button className="outline account-signout-btn" onClick={handleSignOut} disabled={signingOut}>
              <LogOut size={16} />
              {signingOut ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        </section>

        <section className="account-section">
          <div className="account-section-heading">
            <div>
              <h3>Connected Devices</h3>
              <p>Only active devices registered to this account are shown here.</p>
            </div>
            <button className="icon-button" onClick={fetchDevices} disabled={loadingDevices} aria-label="Refresh devices">
              <RefreshCw size={16} className={loadingDevices ? 'spin' : ''} />
            </button>
          </div>

          <div className="device-list" aria-busy={loadingDevices}>
            {!loadingDevices && devices.length === 0 && !errorMessage && (
              <p className="muted">No active devices were returned.</p>
            )}
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
                  <small>App v{device.appVersion} · Last active {new Date(device.lastSeenAt).toLocaleDateString()}</small>
                </div>
                {!device.isCurrentDevice && (
                  <button
                    className="text-button revoke-btn"
                    onClick={() => handleRevoke(device.deviceId)}
                    disabled={revokingId !== null}
                  >
                    {revokingId === device.deviceId ? 'Revoking…' : 'Revoke'}
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="account-section">
          <div className="account-section-heading">
            <div>
              <h3>Data Sovereignty & Export</h3>
              <p>Reverify your identity, then download the records stored in your cloud account.</p>
            </div>
          </div>
          <button className="outline export-button" onClick={handleExportData} disabled={exporting}>
            <Download size={17} />
            {exporting ? 'Preparing export…' : 'Download Secure JSON Bundle'}
          </button>
        </section>
      </div>
    </div>
  )
}

export function AccountPanel(props: AccountPanelProps) {
  const identity = useTendIdentity()
  if (identity.status === 'signedIn' && props.supabaseUrl) {
    return <SignedInAccountPanel {...props} identity={identity} supabaseUrl={props.supabaseUrl} />
  }

  return (
    <div className="account-panel-container">
      <div className="account-panel-card">
        <header className="account-panel-header">
          <div>
            <span className="eyebrow">YOUR TEND ACCOUNT</span>
            <h2>Cloud account unavailable</h2>
          </div>
          {props.onClose && (
            <button className="icon-button" onClick={props.onClose} aria-label="Close panel"><X size={20} /></button>
          )}
        </header>
        <div className="account-alert error" role="status">
          <AlertTriangle size={16} />
          <span>Sign in with configured cloud services to manage synced devices or export cloud data.</span>
        </div>
      </div>
    </div>
  )
}
