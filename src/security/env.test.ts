import { describe, expect, expectTypeOf, it } from 'vitest'

import { readPublicEnvironment } from './env'

const validCloudEnvironment = {
  VITE_CLERK_PUBLISHABLE_KEY: 'pk_test_dGVuZC1jbGVyay1wdWJsaWM',
  VITE_SUPABASE_URL: 'https://example.supabase.co',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_dGVuZC1zdXBhYmFzZS1wdWJsaWM',
}

describe('readPublicEnvironment', () => {
  it('returns cloud null when all three public values are absent', () => {
    expect(readPublicEnvironment({})).toEqual({ cloud: null })
    expect(
      readPublicEnvironment({
        VITE_CLERK_PUBLISHABLE_KEY: '',
        VITE_SUPABASE_URL: '',
        VITE_SUPABASE_PUBLISHABLE_KEY: '',
      }),
    ).toEqual({ cloud: null })
  })

  it('rejects a partial cloud configuration', () => {
    expect(() =>
      readPublicEnvironment({
        VITE_CLERK_PUBLISHABLE_KEY: validCloudEnvironment.VITE_CLERK_PUBLISHABLE_KEY,
      }),
    ).toThrowError('Cloud configuration must provide all three public values')
  })

  it('requires https except for loopback development URLs', () => {
    expect(() =>
      readPublicEnvironment({
        ...validCloudEnvironment,
        VITE_SUPABASE_URL: 'http://supabase.example.test',
      }),
    ).toThrowError('Supabase URL must use HTTPS or a loopback host')

    expect(
      readPublicEnvironment({
        ...validCloudEnvironment,
        VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
      }).cloud?.supabaseUrl.href,
    ).toBe('http://127.0.0.1:54321/')
  })

  it('rejects whitespace, malformed URLs, and non-publishable keys', () => {
    expect(() =>
      readPublicEnvironment({
        ...validCloudEnvironment,
        VITE_CLERK_PUBLISHABLE_KEY: ` ${validCloudEnvironment.VITE_CLERK_PUBLISHABLE_KEY}`,
      }),
    ).toThrowError('Clerk publishable key')

    expect(() =>
      readPublicEnvironment({ ...validCloudEnvironment, VITE_SUPABASE_URL: 'not-a-url' }),
    ).toThrowError('Supabase URL is invalid')

    expect(() =>
      readPublicEnvironment({
        ...validCloudEnvironment,
        VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_server-only',
      }),
    ).toThrowError('Supabase publishable key')
  })

  it('ignores server secrets and keeps them out of ImportMetaEnv', () => {
    type ForbiddenServerNames = Extract<
      keyof ImportMetaEnv,
      | 'CLERK_SECRET_KEY'
      | 'SUPABASE_SERVICE_ROLE_KEY'
      | 'UPSTASH_REDIS_REST_TOKEN'
      | 'CLERK_WEBHOOK_SIGNING_SECRET'
    >

    expectTypeOf<ForbiddenServerNames>().toEqualTypeOf<never>()
    expect(
      readPublicEnvironment({
        CLERK_SECRET_KEY: 'server-only',
        SUPABASE_SERVICE_ROLE_KEY: 'server-only',
      }),
    ).toEqual({ cloud: null })
  })
})
