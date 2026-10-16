/// <reference types="vite/client" />

interface ViteTypeOptions {
  strictImportMetaEnv: unknown
}

interface ImportMetaEnv {
  readonly VITE_CLERK_PUBLISHABLE_KEY?: string
  readonly VITE_CLERK_FRONTEND_API_HOST?: string
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
}

interface Window {
  readonly tendDesktop?: {
    readonly platform: string
    readonly isElectron: true
    readonly version: string
  }
}
