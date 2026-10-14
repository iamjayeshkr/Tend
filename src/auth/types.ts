export type TendIdentity =
  | { status: 'guest'; cloudAvailable: false }
  | { status: 'loading'; cloudAvailable: true }
  | { status: 'locked'; cloudAvailable: true; userId?: string }
  | {
      status: 'signedIn'
      cloudAvailable: true
      userId: string
      getAccessToken: (options?: { forceRefresh?: boolean }) => Promise<string | null>
      signOut: () => Promise<void>
    }
