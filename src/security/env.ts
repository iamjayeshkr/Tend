export type PublicEnvironment = {
  cloud: {
    clerkPublishableKey: string
    supabaseUrl: URL
    supabasePublishableKey: string
  } | null
}

const publicNames = {
  clerk: 'VITE_CLERK_PUBLISHABLE_KEY',
  supabaseUrl: 'VITE_SUPABASE_URL',
  supabaseKey: 'VITE_SUPABASE_PUBLISHABLE_KEY',
} as const

function optionalPublicString(
  source: Record<string, unknown>,
  name: string,
  label: string,
): string | null {
  const value = source[name]
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string' || value.trim() !== value || /\s/.test(value)) {
    throw new Error(`${label} must be a non-empty value without whitespace`)
  }
  return value
}

function parseSupabaseUrl(value: string): URL {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('Supabase URL is invalid')
  }

  const isLoopback =
    url.hostname === 'localhost' || url.hostname === '::1' || url.hostname.startsWith('127.')
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopback)) {
    throw new Error('Supabase URL must use HTTPS or a loopback host')
  }
  if (url.username || url.password) throw new Error('Supabase URL must not include credentials')
  return url
}

export function readPublicEnvironment(source: Record<string, unknown>): PublicEnvironment {
  const clerkPublishableKey = optionalPublicString(
    source,
    publicNames.clerk,
    'Clerk publishable key',
  )
  const supabaseUrl = optionalPublicString(source, publicNames.supabaseUrl, 'Supabase URL')
  const supabasePublishableKey = optionalPublicString(
    source,
    publicNames.supabaseKey,
    'Supabase publishable key',
  )
  const configuredCount = [clerkPublishableKey, supabaseUrl, supabasePublishableKey].filter(Boolean).length

  if (configuredCount === 0) return { cloud: null }
  if (configuredCount !== 3) {
    throw new Error('Cloud configuration must provide all three public values')
  }

  if (!/^pk_(?:test|live)_[A-Za-z0-9_-]+$/.test(clerkPublishableKey!)) {
    throw new Error('Clerk publishable key has an invalid shape')
  }
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(supabasePublishableKey!)) {
    throw new Error('Supabase publishable key has an invalid shape')
  }

  return {
    cloud: {
      clerkPublishableKey: clerkPublishableKey!,
      supabaseUrl: parseSupabaseUrl(supabaseUrl!),
      supabasePublishableKey: supabasePublishableKey!,
    },
  }
}
