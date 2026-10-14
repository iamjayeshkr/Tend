import { SignInButton } from '@clerk/react'
import { Cloud, CloudOff, LogOut } from 'lucide-react'
import { useState } from 'react'

import { useTendIdentity } from './TendAuthProvider'

export function AuthControls({ onSignOut }: { onSignOut?: () => Promise<void> }) {
  const identity = useTendIdentity()
  const [signingOut, setSigningOut] = useState(false)

  if (identity.status === 'guest') {
    return (
      <section className="account-sync" aria-label="Account and cloud sync">
        <CloudOff aria-hidden="true" />
        <div>
          <h2>Cloud sync is optional</h2>
          <p>Your data stays on this device. Add account keys later to sync securely.</p>
        </div>
      </section>
    )
  }

  if (identity.status === 'loading') {
    return (
      <section className="account-sync" aria-label="Account and cloud sync" aria-busy="true">
        <Cloud aria-hidden="true" />
        <div>
          <h2>Checking your account</h2>
          <p>Your local journal remains available while Tend checks the secure session.</p>
        </div>
      </section>
    )
  }

  if (identity.status === 'locked') {
    return (
      <section className="account-sync" aria-label="Account and cloud sync">
        <Cloud aria-hidden="true" />
        <div>
          <h2>Sync when you want it</h2>
          <p>Sign in to keep a secure copy across your devices.</p>
        </div>
        <SignInButton mode="modal">
          <button className="outline" type="button">Sign in to sync</button>
        </SignInButton>
      </section>
    )
  }

  const handleSignOut = async () => {
    setSigningOut(true)
    try {
      await (onSignOut ? onSignOut() : identity.signOut())
    } finally {
      setSigningOut(false)
    }
  }

  return (
    <section className="account-sync" aria-label="Account and cloud sync">
      <Cloud aria-hidden="true" />
      <div>
        <h2>Cloud sync is connected</h2>
        <p>Your local workspace stays separate until you confirm migration.</p>
      </div>
      <button className="outline" type="button" onClick={handleSignOut} disabled={signingOut}>
        <LogOut aria-hidden="true" size={16} />
        {signingOut ? 'Signing out…' : 'Sign out'}
      </button>
    </section>
  )
}
