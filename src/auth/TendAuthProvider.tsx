import { ClerkProvider, useAuth, useClerk } from '@clerk/react'
import { createContext, useContext, useMemo, useRef, type ReactNode } from 'react'

import type { PublicEnvironment } from '../security/env'
import type { TendIdentity } from './types'

const TendIdentityContext = createContext<TendIdentity | null>(null)

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
        await clerk.signOut()
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

  return (
    <ClerkProvider publishableKey={environment.cloud.clerkPublishableKey}>
      <ClerkIdentityBridge>{children}</ClerkIdentityBridge>
    </ClerkProvider>
  )
}

export function useTendIdentity(): TendIdentity {
  const identity = useContext(TendIdentityContext)
  if (!identity) throw new Error('useTendIdentity must be used inside TendAuthProvider')
  return identity
}
