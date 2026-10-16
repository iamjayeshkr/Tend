import { useState } from 'react'
import { SignIn, SignUp } from '@clerk/react'
import {
  ArrowLeft,
  Leaf,
  Shield,
  Sparkles,
  Sprout,
} from 'lucide-react'

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
              <p>After signing in, Tend will show a migration preview before anything is added to your cloud account.</p>
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
                  forceRedirectUrl="/#app"
                  fallbackRedirectUrl="/#app"
                  appearance={{
                    elements: {
                      card: 'clerk-card-override',
                      formButtonPrimary: 'primary clerk-btn-override',
                      footerItem: 'clerk-hide-footer-item',
                      footerPages: 'clerk-hide-footer-item',
                      devModeTag: 'clerk-hide-footer-item',
                    },
                  }}
                />
              ) : (
                <SignUp
                  routing="hash"
                  forceRedirectUrl="/#app"
                  fallbackRedirectUrl="/#app"
                  appearance={{
                    elements: {
                      card: 'clerk-card-override',
                      formButtonPrimary: 'primary clerk-btn-override',
                      footerItem: 'clerk-hide-footer-item',
                      footerPages: 'clerk-hide-footer-item',
                      devModeTag: 'clerk-hide-footer-item',
                    },
                  }}
                />
              )}
            </div>
          ) : (
            <div className="auth-native-form auth-configuration-notice" role="status">
              <Shield size={20} aria-hidden="true" />
              <div>
                <strong>Cloud sign-in is not configured</strong>
                <p>Tend will not collect a password without its verified identity service. You can still use the private offline workspace.</p>
              </div>
            </div>
          )}

          {/* Distinct Offline Guest Mode Alternative (Only when cloud is not configured) */}
          {!clerkPublishableKey && (
            <>
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
            </>
          )}

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
