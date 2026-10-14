import { describe, expect, it, vi } from 'vitest'

import {
  GatewayError,
  createSyncGateway,
  type GatewayClientOptions,
} from './gatewayClient'
import type { PushRequest } from './types'

const deviceId = '8db46216-8f06-4d87-a240-15f153c783b4'
const pushRequest: PushRequest = { deviceId, operations: [] }

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

function options(overrides: Partial<GatewayClientOptions> = {}): GatewayClientOptions {
  return {
    baseUrl: 'https://project.supabase.co/functions/v1/sync',
    getAccessToken: vi.fn(async () => 'session-token'),
    fetch: vi.fn(async () => json({ results: [] })),
    requestId: () => 'request-123',
    timeoutMs: 10_000,
    ...overrides,
  }
}

describe('SyncGateway', () => {
  it('uses a bearer token in memory without placing it in URLs or bodies', async () => {
    const config = options()
    const gateway = createSyncGateway(config)
    await gateway.push(pushRequest)

    const [input, init] = vi.mocked(config.fetch!).mock.calls[0]!
    expect(String(input)).toBe('https://project.supabase.co/functions/v1/sync/push')
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer session-token')
    expect(String(input)).not.toContain('session-token')
    expect(String(init?.body)).not.toContain('session-token')
  })

  it('refreshes exactly once after 401 and keeps the same request id', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(json({ error: { code: 'AUTH_INVALID', message: 'expired', requestId: 'server-1' } }, 401))
      .mockResolvedValueOnce(json({ results: [] }))
    const getAccessToken = vi.fn(async ({ forceRefresh }: { forceRefresh?: boolean } = {}) => (
      forceRefresh ? 'fresh-token' : 'stale-token'
    ))
    const gateway = createSyncGateway(options({ fetch, getAccessToken }))

    await expect(gateway.push(pushRequest)).resolves.toEqual({ results: [] })
    expect(getAccessToken.mock.calls).toEqual([[{ forceRefresh: false }], [{ forceRefresh: true }]])
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(new Headers(fetch.mock.calls[1]![1]?.headers).get('authorization')).toBe('Bearer fresh-token')
    expect(new Headers(fetch.mock.calls[0]![1]?.headers).get('x-request-id')).toBe('request-123')
    expect(new Headers(fetch.mock.calls[1]![1]?.headers).get('x-request-id')).toBe('request-123')
  })

  it('contains credential-provider failures behind a safe typed error', async () => {
    const gateway = createSyncGateway(options({
      getAccessToken: async () => { throw new Error('Clerk internals and session material') },
    }))

    const error = await gateway.push(pushRequest).catch((caught: unknown) => caught) as GatewayError
    expect(error).toMatchObject({ code: 'AUTH_UNAVAILABLE', retryable: true })
    expect(error.message).not.toContain('Clerk')
    expect(error.message).not.toContain('session material')
  })

  it.each([
    [403, 'DEVICE_REVOKED', false],
    [409, 'IDEMPOTENCY_IN_FLIGHT', true],
    [413, 'BODY_TOO_LARGE', false],
    [422, 'VALIDATION_FAILED', false],
    [500, 'INTERNAL_ERROR', true],
    [503, 'SYNC_UNAVAILABLE', true],
  ])('maps HTTP %i to a safe typed error', async (status, code, retryable) => {
    const gateway = createSyncGateway(options({
      fetch: async () => json({ error: {
        code, message: 'provider SQL password must not escape', requestId: 'server-request',
      } }, status),
    }))
    const error = await gateway.push(pushRequest).catch((caught: unknown) => caught) as GatewayError
    expect(error).toBeInstanceOf(GatewayError)
    expect(error).toMatchObject({ status, code, retryable })
    expect(error.message).not.toContain('password')
    expect(error.message).not.toContain('SQL')
  })

  it('honors bounded Retry-After guidance on 429', async () => {
    const gateway = createSyncGateway(options({
      fetch: async () => json({ error: {
        code: 'RATE_LIMITED', message: 'slow down', requestId: 'server-request',
      } }, 429, { 'retry-after': '17' }),
    }))
    await expect(gateway.push(pushRequest)).rejects.toMatchObject({
      status: 429, code: 'RATE_LIMITED', retryable: true, retryAfterSeconds: 17,
    })
  })

  it('aborts timed-out requests and distinguishes caller cancellation', async () => {
    const pendingFetch = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
    }))
    const timerCallbacks: Array<() => void> = []
    const gateway = createSyncGateway(options({
      fetch: pendingFetch,
      setTimer: (callback) => { timerCallbacks.push(callback); return 1 },
      clearTimer: vi.fn(),
    }))
    const timedOut = gateway.push(pushRequest)
    await Promise.resolve()
    timerCallbacks[0]!()
    await expect(timedOut).rejects.toMatchObject({ code: 'TIMEOUT', retryable: true })

    const controller = new AbortController()
    const cancelled = gateway.push(pushRequest, { signal: controller.signal })
    await Promise.resolve()
    controller.abort()
    await expect(cancelled).rejects.toMatchObject({ code: 'CANCELLED', retryable: false })
  })

  it('rejects malformed success and error responses with generic UI-safe failures', async () => {
    const invalidSuccess = createSyncGateway(options({ fetch: async () => json({ results: [{ status: 'admin' }] }) }))
    await expect(invalidSuccess.push(pushRequest)).rejects.toMatchObject({ code: 'INVALID_RESPONSE', retryable: true })

    const invalidError = createSyncGateway(options({ fetch: async () => new Response('<html>secret trace</html>', { status: 500 }) }))
    const error = await invalidError.push(pushRequest).catch((caught: unknown) => caught) as GatewayError
    expect(error.code).toBe('SERVER_ERROR')
    expect(error.message).not.toContain('secret')
  })

  it('validates device registration, migration, and pull response envelopes', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(json({ status: 'registered' }))
      .mockResolvedValueOnce(json({ accepted: true, recordCount: 0, conflicts: [] }))
      .mockResolvedValueOnce(json({ records: [], cursor: 'v1.opaque', hasMore: false }))
    const gateway = createSyncGateway(options({ fetch }))
    await expect(gateway.registerDevice({ deviceId, name: 'Browser', platform: 'web', appVersion: '1.1.14' })).resolves.toEqual({ status: 'registered' })
    await expect(gateway.validateMigration({ deviceId, dryRun: true, operations: [] })).resolves.toEqual({ accepted: true, recordCount: 0, conflicts: [] })
    await expect(gateway.pull({ deviceId, limit: 100 })).resolves.toEqual({ records: [], cursor: 'v1.opaque', hasMore: false })
  })
})
