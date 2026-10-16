import { ClerkProvider as BrowserClerkProvider, useAuth, useClerk } from '@clerk/react'
import { ClerkProvider as DesktopClerkProvider } from '@clerk/electron/react'
import { createContext, useContext, useMemo, useRef, type ReactNode } from 'react'

import type { PublicEnvironment } from '../security/env'
import type { TendIdentity } from './types'

const TendIdentityContext = createContext<TendIdentity | null>(null)

export function landingRedirectUrl(
  location: Pick<Location, 'origin' | 'protocol' | 'host' | 'pathname'>,
): string {
  const origin = location.origin === 'null'
    ? `${location.protocol}//${location.host}`
    : location.origin
  return `${origin}${location.pathname}#landing`
}

function ClerkIdentityBridge({ children }: { children: ReactNode }) {
  const { getToken, isLoaded, isSignedIn, userId } = useAuth()
  const clerk = useClerk()
  const verifiedUserId = useRef<string | null>(null)
  const identity = useMemo<TendIdentity>(() => {
    if (!isLoaded) return { status: 'loading', cloudAvailable: true }
    if (!isSignedIn || !userId) {
      return {
        status: 'locked',
        cloudAvailable: true,
        ...(verifiedUserId.current ? { userId: verifiedUserId.current } : {}),
      }
    }
    verifiedUserId.current = userId
    return {
      status: 'signedIn',
      cloudAvailable: true,
      userId,
      getAccessToken: ({ forceRefresh } = {}) => getToken(forceRefresh ? { skipCache: true } : undefined),
      signOut: async () => {
        verifiedUserId.current = null
        const redirectUrl = typeof window === 'undefined' ? '/#landing' : landingRedirectUrl(window.location)
        await clerk.signOut({ redirectUrl })
      },
    }
  }, [clerk, getToken, isLoaded, isSignedIn, userId])

  return <TendIdentityContext.Provider value={identity}>{children}</TendIdentityContext.Provider>
}

export function TendAuthProvider({
  children,
  environment,
}: {
  children: ReactNode
  environment: PublicEnvironment
}) {
  if (!environment.cloud) {
    return (
      <TendIdentityContext.Provider value={{ status: 'guest', cloudAvailable: false }}>
        {children}
      </TendIdentityContext.Provider>
    )
  }

  const identityBridge = <ClerkIdentityBridge>{children}</ClerkIdentityBridge>

  if (typeof window !== 'undefined' && window.tendDesktop?.isElectron) {
    return (
      <DesktopClerkProvider publishableKey={environment.cloud.clerkPublishableKey}>
        {identityBridge}
      </DesktopClerkProvider>
    )
  }

  return (
    <BrowserClerkProvider publishableKey={environment.cloud.clerkPublishableKey}>
      {identityBridge}
    </BrowserClerkProvider>
  )
}

export function useTendIdentity(): TendIdentity {
  const identity = useContext(TendIdentityContext)
  if (!identity) throw new Error('useTendIdentity must be used inside TendAuthProvider')
  return identity
}
