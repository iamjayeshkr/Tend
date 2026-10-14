import { describe, expect, it, vi } from 'vitest'

import { createSyncHandler, type SyncHandlerDependencies } from './index'
import type { RateLimitDecision } from '../_shared/rateLimit'

const origin = 'https://app.tend.example'
const deviceId = '8db46216-8f06-4d87-a240-15f153c783b4'

function dependencies(overrides: Partial<SyncHandlerDependencies> = {}): SyncHandlerDependencies {
  return {
    allowedOrigins: [origin],
    authenticate: vi.fn(async () => ({ ownerId: 'user_a', sessionId: 'session_a', requestId: 'request-123' })),
    clientIp: vi.fn(() => '203.0.113.42'),
    limit: vi.fn(async () => ({ allowed: true, degraded: false, limit: 30, remaining: 29, headers: {} })),
    push: vi.fn(async () => ({ results: [] })),
    logger: vi.fn(),
    ...overrides,
  }
}

function pushRequest(body: unknown = { deviceId, operations: [] }): Request {
  return new Request('https://edge.tend.example/functions/v1/sync/push', {
    method: 'POST',
    headers: {
      authorization: 'Bearer token',
      'content-type': 'application/json',
      origin,
      'x-forwarded-for': '203.0.113.42, 10.0.0.1',
      'x-request-id': 'request-123',
    },
    body: JSON.stringify(body),
  })
}

describe('sync gateway composition', () => {
  it('authenticates before reading or validating the request body', async () => {
    const deps = dependencies({
      authenticate: vi.fn(async () => { throw new Error('authentication stopped request') }),
    })
    const response = await createSyncHandler(deps)(pushRequest('{not valid'))
    expect(response.status).toBe(500)
    expect(deps.limit).not.toHaveBeenCalled()
    expect(deps.push).not.toHaveBeenCalled()
  })

  it('composes validation, rate limiting, mutation, and hardened response headers', async () => {
    const deps = dependencies()
    const response = await createSyncHandler(deps)(pushRequest())
    expect(response.status).toBe(200)
    expect(deps.limit).toHaveBeenCalledWith(expect.objectContaining({ deviceId, clientIp: '203.0.113.42' }))
    expect(deps.push).toHaveBeenCalledOnce()
    expect(response.headers.get('access-control-allow-origin')).toBe(origin)
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it('stops before mutation when the shared limiter denies the request', async () => {
    const deps = dependencies({
      limit: vi.fn(async (): Promise<RateLimitDecision> => ({
        allowed: false, degraded: false, limit: 30, remaining: 0, status: 429,
        limitedBy: 'account', retryAfterSeconds: 60, headers: { 'Retry-After': '60' },
      })),
    })
    const response = await createSyncHandler(deps)(pushRequest())
    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe('60')
    expect(deps.push).not.toHaveBeenCalled()
  })
})
