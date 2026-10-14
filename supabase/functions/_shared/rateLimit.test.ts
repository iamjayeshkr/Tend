import { describe, expect, it, vi } from 'vitest'

import { recordSecurityEvent } from './audit'
import {
  RATE_LIMIT_POLICIES,
  enforceRateLimit,
  type RateLimitIncrement,
  type RateLimitStore,
} from './rateLimit'

class FakeStore implements RateLimitStore {
  readonly calls: RateLimitIncrement[] = []
  private readonly counts = new Map<string, number>()

  async increment(input: RateLimitIncrement): Promise<number> {
    this.calls.push(input)
    const next = (this.counts.get(input.key) ?? 0) + 1
    this.counts.set(input.key, next)
    return next
  }
}

const nowMs = Date.UTC(2026, 9, 14, 12, 0, 0)
const common = {
  ownerId: 'user_raw_private',
  deviceId: 'device_raw_private',
  clientIp: '203.0.113.42',
  requestId: 'request-123',
  keySecret: 'test-only-rate-limit-pepper-with-32-bytes',
  now: () => nowMs,
}

describe('shared rate limiting', () => {
  it('exports the exact versioned operation limits and key TTLs', () => {
    expect(RATE_LIMIT_POLICIES).toEqual({
      pull: { limit: 120, windowSeconds: 60, ttlSeconds: 120, degradedLimit: 12 },
      push: { limit: 30, windowSeconds: 60, ttlSeconds: 120, degradedLimit: 3 },
      migration: { limit: 3, windowSeconds: 3_600, ttlSeconds: 3_660, degradedLimit: 0 },
      export: { limit: 5, windowSeconds: 3_600, ttlSeconds: 3_660, degradedLimit: 0 },
      revoke: { limit: 10, windowSeconds: 3_600, ttlSeconds: 3_660, degradedLimit: 0 },
      delete: { limit: 3, windowSeconds: 3_600, ttlSeconds: 3_660, degradedLimit: 0 },
    })
  })

  it('returns Retry-After when the account limit is exceeded despite device rotation', async () => {
    const store = new FakeStore()
    for (let index = 0; index < 30; index += 1) {
      const decision = await enforceRateLimit({
        ...common,
        operation: 'push',
        deviceId: `rotated-device-${index}`,
        store,
      })
      expect(decision.allowed).toBe(true)
    }

    const denied = await enforceRateLimit({
      ...common,
      operation: 'push',
      deviceId: 'rotated-device-final',
      store,
    })
    expect(denied).toMatchObject({
      allowed: false,
      degraded: false,
      status: 429,
      limitedBy: 'account',
      retryAfterSeconds: 60,
      headers: { 'Retry-After': '60' },
    })
  })

  it('cannot bypass the IP limit by rotating both accounts and devices', async () => {
    const store = new FakeStore()
    for (let index = 0; index < 120; index += 1) {
      const decision = await enforceRateLimit({
        ...common,
        operation: 'pull',
        ownerId: `user-${index}`,
        deviceId: `device-${index}`,
        store,
      })
      expect(decision.allowed).toBe(true)
    }

    const denied = await enforceRateLimit({
      ...common,
      operation: 'pull',
      ownerId: 'user-final',
      deviceId: 'device-final',
      store,
    })
    expect(denied).toMatchObject({ allowed: false, limitedBy: 'ip', retryAfterSeconds: 60 })
  })

  it('uses independent pseudonymous account, IP, and per-account device buckets', async () => {
    const store = new FakeStore()
    await enforceRateLimit({ ...common, operation: 'push', store })
    await enforceRateLimit({ ...common, operation: 'push', deviceId: 'second-device', store })

    expect(store.calls).toHaveLength(6)
    expect(store.calls.map(({ dimension }) => dimension)).toEqual([
      'account', 'ip', 'device', 'account', 'ip', 'device',
    ])
    expect(store.calls[2].key).not.toBe(store.calls[5].key)
    expect(store.calls.every(({ ttlSeconds }) => ttlSeconds === 120)).toBe(true)
    const serialized = JSON.stringify(store.calls)
    expect(serialized).not.toContain(common.ownerId)
    expect(serialized).not.toContain(common.deviceId)
    expect(serialized).not.toContain(common.clientIp)
  })

  it('fails closed for sensitive operations when the shared store is unavailable', async () => {
    const store: RateLimitStore = { increment: vi.fn(async () => { throw new Error('redis token leaked') }) }
    const audit = vi.fn()
    const decision = await enforceRateLimit({ ...common, operation: 'delete', store, audit })

    expect(decision).toMatchObject({
      allowed: false,
      degraded: false,
      status: 503,
      retryAfterSeconds: 30,
      headers: { 'Retry-After': '30' },
    })
    expect(JSON.stringify(audit.mock.calls)).not.toContain('redis token leaked')
  })

  it('uses a lower bounded fallback for ordinary sync during shared-store failure', async () => {
    const unavailable: RateLimitStore = { increment: async () => { throw new Error('offline') } }
    const degradedStore = new FakeStore()

    for (let index = 0; index < 3; index += 1) {
      await expect(enforceRateLimit({
        ...common, operation: 'push', store: unavailable, degradedStore,
      })).resolves.toMatchObject({ allowed: true, degraded: true })
    }
    await expect(enforceRateLimit({
      ...common, operation: 'push', store: unavailable, degradedStore,
    })).resolves.toMatchObject({
      allowed: false, degraded: true, status: 429, retryAfterSeconds: 60,
    })
  })

  it('records only safe event codes, request ids, and pseudonymous identifiers', async () => {
    const store: RateLimitStore = { increment: async () => 999 }
    const events: unknown[] = []
    await enforceRateLimit({ ...common, operation: 'push', store, audit: (event) => { events.push(event) } })

    const logger = vi.fn()
    recordSecurityEvent(events[0] as Parameters<typeof recordSecurityEvent>[0], logger)
    const output = JSON.stringify(logger.mock.calls)
    expect(output).toContain('RATE_LIMITED')
    expect(output).toContain(common.requestId)
    expect(output).toContain('hmac-sha256:')
    expect(output).not.toContain(common.ownerId)
    expect(output).not.toContain(common.deviceId)
    expect(output).not.toContain(common.clientIp)
    expect(Object.keys(logger.mock.calls[0][0])).toEqual([
      'eventCode', 'requestId', 'principalRef', 'networkRef', 'deviceRef',
    ])
  })
})
