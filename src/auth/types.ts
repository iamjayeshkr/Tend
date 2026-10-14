export type TendIdentity =
  | { status: 'guest'; cloudAvailable: false }
  | { status: 'loading'; cloudAvailable: true }
  | { status: 'locked'; cloudAvailable: true }
  | {
      status: 'signedIn'
      cloudAvailable: true
      userId: string
      getAccessToken: () => Promise<string | null>
      signOut: () => Promise<void>
    }
