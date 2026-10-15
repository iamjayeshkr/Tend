import { describe, expect, it, vi } from 'vitest'

import { ApiFailure } from '../_shared/http.ts'
import type { RateLimitDecision } from '../_shared/rateLimit.ts'
import { createAccountHandler, type AccountHandlerDependencies } from './index.ts'

const ORIGIN = 'https://app.tend.example'
const DEVICE_ID = 'a0000000-0000-4000-8000-000000000001'
const OTHER_DEVICE_ID = 'b0000000-0000-4000-8000-000000000002'

function dependencies(overrides: Partial<AccountHandlerDependencies> = {}): AccountHandlerDependencies {
  return {
    allowedOrigins: [ORIGIN],
    authenticate: vi.fn(async () => ({
      ownerId: 'user_a',
      sessionId: 'session_a',
      requestId: 'request-account',
      factorVerificationAge: [0, -1],
    })),
    clientIp: vi.fn(() => '203.0.113.42'),
    limit: vi.fn(async () => ({ allowed: true, degraded: false, limit: 10, remaining: 9, headers: {} })),
    list: vi.fn(async () => []),
    revoke: vi.fn(async (_principal, _currentDeviceId, deviceId) => ({
      success: true,
      revokedDeviceId: deviceId,
    })),
    exportData: vi.fn(async () => ({
      version: 1 as const,
      exportedAt: '2026-10-15T10:00:00.000Z',
      ownerId: 'user_a',
      collections: {
        tasks: [], routine: [], activities: [], ideas: [], reviews: [], sets: [],
        wakeLogs: [], sleepLogs: [], settings: [],
      },
    })),
    logger: vi.fn(),
    ...overrides,
  }
}

function request(path: string, init: RequestInit = {}): Request {
  return new Request(`https://edge.tend.example/functions/v1/account${path}`, {
    ...init,
    headers: {
      authorization: 'Bearer verified-session',
      origin: ORIGIN,
      'x-device-id': DEVICE_ID,
      'x-request-id': 'request-account',
      ...init.headers,
    },
  })
}

describe('account gateway composition', () => {
  it('denies direct unauthenticated calls before parsing bodies or touching data', async () => {
    const deps = dependencies({
      authenticate: vi.fn(async () => {
        throw new ApiFailure(401, 'AUTH_REQUIRED', 'Sign in required.')
      }),
    })
    const response = await createAccountHandler(deps)(request('/devices/revoke', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not-json',
    }))

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'AUTH_REQUIRED' } })
    expect(deps.limit).not.toHaveBeenCalled()
    expect(deps.revoke).not.toHaveBeenCalled()
  })

  it('rejects unapproved origins before authentication', async () => {
    const deps = dependencies()
    const response = await createAccountHandler(deps)(request('/devices', {
      headers: { origin: 'https://app.tend.example.evil' },
    }))

    expect(response.status).toBe(403)
    expect(deps.authenticate).not.toHaveBeenCalled()
    expect(deps.list).not.toHaveBeenCalled()
  })

  it('routes device list, revocation, and export through exact shared limits', async () => {
    const deps = dependencies()
    const handler = createAccountHandler(deps)

    const listed = await handler(request('/devices'))
    const revoked = await handler(request('/devices/revoke', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ deviceId: OTHER_DEVICE_ID }),
    }))
    const exported = await handler(request('/export'))

    expect(listed.status).toBe(200)
    expect(revoked.status).toBe(200)
    expect(exported.status).toBe(200)
    expect(deps.limit).toHaveBeenNthCalledWith(1, expect.objectContaining({ operation: 'pull', deviceId: DEVICE_ID }))
    expect(deps.limit).toHaveBeenNthCalledWith(2, expect.objectContaining({ operation: 'revoke', deviceId: DEVICE_ID }))
    expect(deps.limit).toHaveBeenNthCalledWith(3, expect.objectContaining({ operation: 'export', deviceId: DEVICE_ID }))
    expect(deps.revoke).toHaveBeenCalledWith(expect.objectContaining({ ownerId: 'user_a' }), DEVICE_ID, OTHER_DEVICE_ID)
    expect(exported.headers.get('content-disposition')).toContain('tend-account-export-v1.json')
    expect(exported.headers.get('cache-control')).toBe('no-store')
    expect(exported.headers.get('access-control-allow-origin')).toBe(ORIGIN)
  })

  it('rejects injected owner fields and stops when the limiter denies', async () => {
    const injectionDeps = dependencies()
    const injected = await createAccountHandler(injectionDeps)(request('/devices/revoke', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ deviceId: OTHER_DEVICE_ID, ownerId: 'user_other' }),
    }))
    expect(injected.status).toBe(422)
    expect(injectionDeps.revoke).not.toHaveBeenCalled()

    const deniedDeps = dependencies({
      limit: vi.fn(async (): Promise<RateLimitDecision> => ({
        allowed: false,
        degraded: false,
        limit: 5,
        remaining: 0,
        status: 429,
        limitedBy: 'account',
        retryAfterSeconds: 120,
        headers: { 'Retry-After': '120' },
      })),
    })
    const denied = await createAccountHandler(deniedDeps)(request('/export'))
    expect(denied.status).toBe(429)
    expect(denied.headers.get('retry-after')).toBe('120')
    expect(deniedDeps.exportData).not.toHaveBeenCalled()
  })

  it('returns Clerk-compatible reverification metadata with a stable Tend error code', async () => {
    const deps = dependencies({
      exportData: vi.fn(async () => {
        throw new ApiFailure(403, 'REVERIFICATION_REQUIRED', 'Verify your identity again to continue.')
      }),
    })
    const response = await createAccountHandler(deps)(request('/export'))
    const body = await response.json()

    expect(response.status).toBe(403)
    expect(body).toMatchObject({
      clerk_error: {
        type: 'forbidden',
        reason: 'reverification-error',
        metadata: { reverification: 'strict' },
      },
      error: { code: 'REVERIFICATION_REQUIRED', requestId: 'request-account' },
    })
  })

  it('allows only exact-origin account preflights and the device header', async () => {
    const response = await createAccountHandler(dependencies())(new Request(
      'https://edge.tend.example/functions/v1/account/devices',
      {
        method: 'OPTIONS',
        headers: {
          origin: ORIGIN,
          'access-control-request-method': 'GET',
          'access-control-request-headers': 'authorization, x-device-id, x-request-id',
        },
      },
    ))
    expect(response.status).toBe(204)
    expect(response.headers.get('access-control-allow-headers')).toContain('x-device-id')
  })
})
