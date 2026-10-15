import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@clerk/react', () => ({
  SignIn: (props: { forceRedirectUrl?: string; fallbackRedirectUrl?: string }) => (
    <div data-clerk="sign-in" data-force={props.forceRedirectUrl} data-fallback={props.fallbackRedirectUrl} />
  ),
  SignUp: (props: { forceRedirectUrl?: string; fallbackRedirectUrl?: string }) => (
    <div data-clerk="sign-up" data-force={props.forceRedirectUrl} data-fallback={props.fallbackRedirectUrl} />
  ),
}))

import { AuthPage } from './AuthPage'

const callbacks = {
  onBack: vi.fn(),
  onContinueAsGuest: vi.fn(),
}

describe('AuthPage', () => {
  it('never renders a credential-accepting imitation form when Clerk is unavailable', () => {
    const html = renderToStaticMarkup(<AuthPage {...callbacks} />)
    expect(html).toContain('Cloud sign-in is not configured')
    expect(html).toContain('Continue as Guest')
    expect(html).not.toContain('type="email"')
    expect(html).not.toContain('type="password"')
    expect(html).not.toContain('Sign In to Workspace')
  })

  it.each([
    ['signin', 'sign-in'],
    ['signup', 'sign-up'],
  ] as const)('mounts Clerk %s with a forced app redirect', (initialMode, component) => {
    const html = renderToStaticMarkup(
      <AuthPage {...callbacks} initialMode={initialMode} clerkPublishableKey="pk_test_public" />,
    )
    expect(html).toContain(`data-clerk="${component}"`)
    expect(html).toContain('data-force="/#app"')
    expect(html).toContain('data-fallback="/#app"')
  })
})
