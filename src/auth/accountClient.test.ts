import { describe, expect, it, vi } from 'vitest'

import {
  AccountRequestError,
  createAccountClient,
  parseDeviceSummaries,
} from './accountClient'

const DEVICE_ID = 'a0000000-0000-4000-8000-000000000001'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('account client', () => {
  it('keeps the Clerk token in the authorization header and always sends the device id', async () => {
    const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => json([]))
    const client = createAccountClient({
      baseUrl: 'https://project.supabase.co/functions/v1/account',
      deviceId: DEVICE_ID,
      getAccessToken: vi.fn(async () => 'session-token'),
      fetch,
      requestId: () => 'request-client',
    })

    await client.request('/devices')
    const [input, init] = fetch.mock.calls[0]!
    expect(String(input)).toBe('https://project.supabase.co/functions/v1/account/devices')
    expect(String(input)).not.toContain('session-token')
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer session-token')
    expect(new Headers(init?.headers).get('x-device-id')).toBe(DEVICE_ID)
    expect(new Headers(init?.headers).get('x-request-id')).toBe('request-client')
  })

  it('refreshes a stale token once after 401 and rejects a missing session', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(json({ error: { code: 'TOKEN_EXPIRED' } }, 401))
      .mockResolvedValueOnce(json([]))
    const getAccessToken = vi.fn(async ({ forceRefresh }: { forceRefresh?: boolean } = {}) => (
      forceRefresh ? 'fresh-token' : 'stale-token'
    ))
    const client = createAccountClient({
      baseUrl: 'https://project.supabase.co/functions/v1/account',
      deviceId: DEVICE_ID,
      getAccessToken,
      fetch,
      requestId: () => 'request-client',
    })

    await expect(client.request('/devices')).resolves.toBeInstanceOf(Response)
    expect(getAccessToken.mock.calls).toEqual([[{ forceRefresh: false }], [{ forceRefresh: true }]])
    expect(new Headers(fetch.mock.calls[1]![1]?.headers).get('authorization')).toBe('Bearer fresh-token')

    const signedOut = createAccountClient({
      baseUrl: 'https://project.supabase.co/functions/v1/account',
      deviceId: DEVICE_ID,
      getAccessToken: async () => null,
      fetch,
    })
    await expect(signedOut.request('/devices')).rejects.toMatchObject({ code: 'AUTH_REQUIRED' })
  })

  it('preserves Clerk reverification hints but rejects ordinary endpoint failures safely', async () => {
    const reverification = {
      clerk_error: {
        type: 'forbidden',
        reason: 'reverification-error',
        metadata: { reverification: 'strict' },
      },
      error: { code: 'REVERIFICATION_REQUIRED', message: 'Verify again', requestId: 'server-id' },
    }
    const fetch = vi.fn()
      .mockResolvedValueOnce(json(reverification, 403))
      .mockResolvedValueOnce(json({
        error: { code: 'DEVICE_REVOKED', message: 'database detail', requestId: 'server-id' },
      }, 403))
    const client = createAccountClient({
      baseUrl: 'https://project.supabase.co/functions/v1/account',
      deviceId: DEVICE_ID,
      getAccessToken: async () => 'session-token',
      fetch,
    })

    const hint = await client.request('/export')
    await expect(hint.json()).resolves.toMatchObject(reverification)
    const failure = await client.request('/devices').catch((error: unknown) => error) as AccountRequestError
    expect(failure).toMatchObject({ status: 403, code: 'DEVICE_REVOKED' })
    expect(failure.message).not.toContain('database')
  })

  it('strictly validates device-list responses before rendering them', () => {
    const valid = [{
      deviceId: DEVICE_ID,
      name: 'Current browser',
      platform: 'web',
      appVersion: '1.1.14',
      createdAt: '2026-10-15T10:00:00.000Z',
      lastSeenAt: '2026-10-15T10:00:00.000Z',
      revokedAt: null,
      isCurrentDevice: true,
    }]
    expect(parseDeviceSummaries(valid)).toEqual(valid)
    expect(() => parseDeviceSummaries([{ ...valid[0], ownerId: 'user_other' }])).toThrow(AccountRequestError)
    expect(() => parseDeviceSummaries([{ ...valid[0], platform: '<script>' }])).toThrow(AccountRequestError)
  })
})
