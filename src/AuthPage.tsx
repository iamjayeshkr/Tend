import { useState } from 'react'
import { SignIn, SignUp } from '@clerk/react'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Cloud,
  Globe,
  Leaf,
  Lock,
  Mail,
  Shield,
  Smartphone,
  Sparkles,
  Sprout,
  X,
} from 'lucide-react'
import { useTendIdentity } from './auth/TendAuthProvider'

export type AuthPageProps = {
  initialMode?: 'signin' | 'signup'
  clerkPublishableKey?: string
  hasLocalGuestData?: boolean
  onBack: () => void
  onContinueAsGuest: () => void
}

export function AuthPage({
  initialMode = 'signin',
  clerkPublishableKey,
  hasLocalGuestData = false,
  onBack,
  onContinueAsGuest,
}: AuthPageProps) {
  const [mode, setMode] = useState<'signin' | 'signup'>(initialMode)
  const identity = useTendIdentity()

  // Mock / direct fallback form states if Clerk is not configured
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mockLoading, setMockLoading] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)

  const handleMockSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setAuthError(null)
    setMockLoading(true)
    try {
      // If clerk is present, Clerk components handle submission.
      // Otherwise in guest/offline mode:
      setTimeout(() => {
        setMockLoading(false)
        onContinueAsGuest()
      }, 500)
    } catch {
      setAuthError('Authentication could not complete. Continuing as guest.')
      setMockLoading(false)
    }
  }

  return (
    <div className="auth-page-container">
      {/* Background Ambience */}
      <div className="auth-paper-backdrop" />

      {/* Auth Card Container */}
      <div className="auth-card-frame">
        {/* Top Header */}
        <div className="auth-top-nav">
          <button className="text-button auth-back-btn" onClick={onBack}>
            <ArrowLeft size={16} />
            <span>Back to Tend</span>
          </button>
          <div className="auth-brand-badge">
            <Sprout className="auth-sprout" />
            <span>tend / access</span>
          </div>
        </div>

        {/* Guest Data Detection Banner */}
        {hasLocalGuestData && (
          <div className="guest-detect-banner">
            <Sparkles size={16} />
            <div>
              <strong>Local journal detected on this device</strong>
              <p>Signing in will automatically and safely sync your existing tasks and reflections.</p>
            </div>
          </div>
        )}

        <div className="auth-main-card">
          <header className="auth-card-header">
            <h2>{mode === 'signin' ? 'Welcome back.' : 'Begin with clarity.'}</h2>
            <p>
              {mode === 'signin'
                ? 'Sign in to access your synced focus sessions and reflections.'
                : 'Create an account to keep your commitments synchronized across all devices.'}
            </p>

            {/* Mode Switcher Tabs */}
            <div className="auth-tabs-toggle" role="tablist">
              <button
                role="tab"
                aria-selected={mode === 'signin'}
                className={`auth-tab ${mode === 'signin' ? 'active' : ''}`}
                onClick={() => setMode('signin')}
              >
                Sign In
              </button>
              <button
                role="tab"
                aria-selected={mode === 'signup'}
                className={`auth-tab ${mode === 'signup' ? 'active' : ''}`}
                onClick={() => setMode('signup')}
              >
                Create Account
              </button>
            </div>
          </header>

          {/* If Clerk is configured with a valid public key */}
          {clerkPublishableKey ? (
            <div className="clerk-mount-wrapper">
              {mode === 'signin' ? (
                <SignIn
                  routing="hash"
                  appearance={{
                    elements: {
                      card: 'clerk-card-override',
                      formButtonPrimary: 'primary clerk-btn-override',
                    },
                  }}
                />
              ) : (
                <SignUp
                  routing="hash"
                  appearance={{
                    elements: {
                      card: 'clerk-card-override',
                      formButtonPrimary: 'primary clerk-btn-override',
                    },
                  }}
                />
              )}
            </div>
          ) : (
            /* Elegant Native Fallback Form (Offline / Self-contained) */
            <form className="auth-native-form" onSubmit={handleMockSubmit}>
              {authError && <div className="auth-error-alert">{authError}</div>}

              <label className="field">
                <span>Email address</span>
                <div className="input-with-icon">
                  <Mail size={16} />
                  <input
                    type="email"
                    required
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </label>

              <label className="field">
                <span>Password</span>
                <div className="input-with-icon">
                  <Lock size={16} />
                  <input
                    type="password"
                    required
                    placeholder="••••••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
              </label>

              <button className="primary auth-submit-btn" type="submit" disabled={mockLoading}>
                <span>{mockLoading ? 'Authenticating…' : mode === 'signin' ? 'Sign In to Workspace' : 'Create Synced Account'}</span>
                <ArrowRight size={17} />
              </button>
            </form>
          )}

          {/* Distinct Offline Guest Mode Alternative */}
          <div className="auth-divider">
            <span>OR STAY OFFLINE</span>
          </div>

          <div className="guest-alternative-box">
            <div className="guest-copy">
              <strong>Prefer zero accounts?</strong>
              <p>Tend works 100% offline. No email or cloud sync required.</p>
            </div>
            <button className="outline guest-continue-btn" onClick={onContinueAsGuest}>
              <Leaf size={16} />
              <span>Continue as Guest</span>
            </button>
          </div>

          {/* Privacy Guarantee Footer */}
          <footer className="auth-card-footer">
            <Shield size={14} />
            <span>Private by design. No tracking, ads, or attention selling.</span>
          </footer>
        </div>
      </div>
    </div>
  )
}
