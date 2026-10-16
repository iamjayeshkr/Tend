import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'

function endpointOrigin(value: string, variableName: string): string {
  if (!value) return ''
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error(`${variableName} must be a valid URL.`)
  }
  const isLocalDevelopment = url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)
  if ((!isLocalDevelopment && url.protocol !== 'https:') || url.origin !== value.replace(/\/$/, '')) {
    throw new Error(`${variableName} must contain only an HTTPS origin (or localhost for development).`)
  }
  return url.origin
}

function clerkFrontendHost(value: string): string {
  if (!value) return ''
  const candidate = value.trim()
  let url: URL
  try {
    url = new URL(`https://${candidate}`)
  } catch {
    throw new Error('VITE_CLERK_FRONTEND_API_HOST must be a hostname without a protocol or path.')
  }
  if (url.host !== candidate || url.pathname !== '/' || url.search || url.hash || url.username || url.password) {
    throw new Error('VITE_CLERK_FRONTEND_API_HOST must be a hostname without a protocol or path.')
  }
  return candidate
}

function deriveClerkFrontendApiHost(publishableKey: string): string {
  if (!publishableKey) return ''
  const parts = publishableKey.split('_')
  if (parts.length >= 3 && parts[0] === 'pk' && (parts[1] === 'test' || parts[1] === 'live')) {
    const raw = parts.slice(2).join('_').replace(/\$$/, '')
    try {
      const decoded = Buffer.from(raw, 'base64').toString('utf8').trim().replace(/\$$/, '')
      if (decoded) return clerkFrontendHost(decoded)
    } catch {
      // ignore
    }
  }
  return ''
}

function desktopConfiguration(config: { clerkFrontendApiHost: string; supabaseOrigin: string }): Plugin {
  return {
    name: 'tend-desktop-configuration',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'desktop-config.json',
        source: `${JSON.stringify(config)}\n`,
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, process.cwd(), '')
  const publishableKey = environment.VITE_CLERK_PUBLISHABLE_KEY?.trim() ?? ''
  const rawHost = environment.VITE_CLERK_FRONTEND_API_HOST?.trim() ?? ''
  const frontendApiHost = rawHost
    ? clerkFrontendHost(rawHost)
    : deriveClerkFrontendApiHost(publishableKey)
  if (Boolean(publishableKey) !== Boolean(frontendApiHost)) {
    throw new Error(
      'VITE_CLERK_PUBLISHABLE_KEY and VITE_CLERK_FRONTEND_API_HOST must be configured together.',
    )
  }

  return {
    plugins: [
      react(),
      desktopConfiguration({
        clerkFrontendApiHost: frontendApiHost,
        supabaseOrigin: endpointOrigin(environment.VITE_SUPABASE_URL ?? '', 'VITE_SUPABASE_URL'),
      }),
    ],
    base: './',
    build: { target: 'chrome80' },
    server: { host: '0.0.0.0' },
  }
})
