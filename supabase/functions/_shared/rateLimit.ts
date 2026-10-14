import type { SecurityEvent } from './audit'

export type RateLimitOperation = 'pull' | 'push' | 'migration' | 'export' | 'revoke' | 'delete'
export type RateLimitDimension = 'account' | 'ip' | 'device'

export type RateLimitPolicy = {
  limit: number
  windowSeconds: number
  ttlSeconds: number
  degradedLimit: number
}

export const RATE_LIMIT_POLICIES: Readonly<Record<RateLimitOperation, Readonly<RateLimitPolicy>>> = {
  pull: { limit: 120, windowSeconds: 60, ttlSeconds: 120, degradedLimit: 12 },
  push: { limit: 30, windowSeconds: 60, ttlSeconds: 120, degradedLimit: 3 },
  migration: { limit: 3, windowSeconds: 3_600, ttlSeconds: 3_660, degradedLimit: 0 },
  export: { limit: 5, windowSeconds: 3_600, ttlSeconds: 3_660, degradedLimit: 0 },
  revoke: { limit: 10, windowSeconds: 3_600, ttlSeconds: 3_660, degradedLimit: 0 },
  delete: { limit: 3, windowSeconds: 3_600, ttlSeconds: 3_660, degradedLimit: 0 },
}

export type RateLimitIncrement = {
  key: string
  dimension: RateLimitDimension
  ttlSeconds: number
}

export type RateLimitStore = {
  /** Atomically increment the bucket and set its TTL when first created. */
  increment(input: RateLimitIncrement): Promise<number>
}

export type RedisEvalClient = {
  eval<TData = unknown>(script: string, keys: string[], args: Array<string | number>): Promise<TData>
}

const ATOMIC_INCREMENT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return count
`

/** Creates the narrow adapter used with an authenticated @upstash/redis client. */
export function createUpstashRateLimitStore(redis: RedisEvalClient): RateLimitStore {
  return {
    async increment(input) {
      const count = await redis.eval<number>(
        ATOMIC_INCREMENT,
        [input.key],
        [input.ttlSeconds],
      )
      if (!Number.isSafeInteger(count) || count < 1) {
        throw new Error('Rate-limit store returned an invalid count.')
      }
      return count
    },
  }
}

type LocalBucket = { count: number; expiresAt: number }

class BoundedDegradedStore implements RateLimitStore {
  private readonly buckets = new Map<string, LocalBucket>()

  async increment(input: RateLimitIncrement): Promise<number> {
    const now = Date.now()
    const current = this.buckets.get(input.key)
    const next = current && current.expiresAt > now
      ? { ...current, count: current.count + 1 }
      : { count: 1, expiresAt: now + input.ttlSeconds * 1_000 }
    this.buckets.set(input.key, next)

    if (this.buckets.size > 2_000) {
      for (const [key, bucket] of this.buckets) {
        if (bucket.expiresAt <= now) this.buckets.delete(key)
      }
      while (this.buckets.size > 2_000) {
        const oldestKey = this.buckets.keys().next().value
        if (typeof oldestKey !== 'string') break
        this.buckets.delete(oldestKey)
      }
    }
    return next.count
  }
}

const defaultDegradedStore = new BoundedDegradedStore()

export type RateLimitDecision = {
  allowed: boolean
  degraded: boolean
  limit: number
  remaining: number
  status?: 429 | 503
  limitedBy?: RateLimitDimension | 'store'
  retryAfterSeconds?: number
  headers: Record<string, string>
}

export type EnforceRateLimitInput = {
  ownerId: string
  deviceId: string
  clientIp: string
  requestId: string
  operation: RateLimitOperation
  keySecret: string
  store: RateLimitStore
  degradedStore?: RateLimitStore
  audit?: (event: SecurityEvent) => void | Promise<void>
  now?: () => number
}

type BucketIdentity = {
  principalRef: string
  networkRef: string
  deviceRef: string
}

function asHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function pseudonym(secret: string, scope: string, value: string): Promise<string> {
  if (secret.length < 32) throw new Error('Rate-limit key secret must contain at least 32 characters.')
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const digest = await crypto.subtle.sign('HMAC', key, encoder.encode(`${scope}\u0000${value}`))
  return `hmac-sha256:${asHex(digest).slice(0, 32)}`
}

function normalizedIp(value: string): string {
  const candidate = value.trim().toLowerCase()
  const ipv4Parts = candidate.split('.')
  const isIpv4 = ipv4Parts.length === 4
    && ipv4Parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255)
  const isIpv6 = candidate.includes(':') && /^[0-9a-f:]+$/.test(candidate)
  if (!isIpv4 && !isIpv6) throw new Error('A normalized client IP is required.')
  return candidate
}

async function bucketIdentity(input: EnforceRateLimitInput): Promise<BucketIdentity> {
  const ip = normalizedIp(input.clientIp)
  const [principalRef, networkRef, deviceRef] = await Promise.all([
    pseudonym(input.keySecret, 'account', input.ownerId),
    pseudonym(input.keySecret, 'ip', ip),
    pseudonym(input.keySecret, 'device', `${input.ownerId}\u0000${input.deviceId}`),
  ])
  return { principalRef, networkRef, deviceRef }
}

function retryAfter(nowMs: number, windowSeconds: number): number {
  const windowMs = windowSeconds * 1_000
  const resetAt = (Math.floor(nowMs / windowMs) + 1) * windowMs
  return Math.max(1, Math.ceil((resetAt - nowMs) / 1_000))
}

function bucketKey(
  operation: RateLimitOperation,
  dimension: RateLimitDimension,
  reference: string,
  nowMs: number,
  windowSeconds: number,
  degraded: boolean,
): string {
  const bucket = Math.floor(nowMs / (windowSeconds * 1_000))
  return `tend:rl:v1:${degraded ? 'degraded' : 'shared'}:${operation}:${dimension}:${reference}:${bucket}`
}

async function consumeDimensions(
  store: RateLimitStore,
  operation: RateLimitOperation,
  identity: BucketIdentity,
  policy: RateLimitPolicy,
  limit: number,
  nowMs: number,
  degraded: boolean,
): Promise<{ counts: Record<RateLimitDimension, number>; limitedBy?: RateLimitDimension }> {
  const dimensions: Array<[RateLimitDimension, string]> = [
    ['account', identity.principalRef],
    ['ip', identity.networkRef],
    ['device', identity.deviceRef],
  ]
  const values = await Promise.all(dimensions.map(async ([dimension, reference]) => {
    const count = await store.increment({
      key: bucketKey(operation, dimension, reference, nowMs, policy.windowSeconds, degraded),
      dimension,
      ttlSeconds: policy.ttlSeconds,
    })
    return [dimension, count] as const
  }))
  const counts = Object.fromEntries(values) as Record<RateLimitDimension, number>
  return { counts, limitedBy: dimensions.find(([dimension]) => counts[dimension] > limit)?.[0] }
}

function securityEvent(
  eventCode: string,
  requestId: string,
  identity: BucketIdentity,
): SecurityEvent {
  return { eventCode, requestId, ...identity }
}

function allowedDecision(limit: number, counts: Record<RateLimitDimension, number>, degraded: boolean): RateLimitDecision {
  return {
    allowed: true,
    degraded,
    limit,
    remaining: Math.max(0, limit - Math.max(...Object.values(counts))),
    headers: {},
  }
}

function deniedDecision(
  limit: number,
  retryAfterSeconds: number,
  degraded: boolean,
  limitedBy: RateLimitDimension | 'store',
  status: 429 | 503,
): RateLimitDecision {
  return {
    allowed: false,
    degraded,
    limit,
    remaining: 0,
    status,
    limitedBy,
    retryAfterSeconds,
    headers: { 'Retry-After': String(retryAfterSeconds) },
  }
}

export async function enforceRateLimit(input: EnforceRateLimitInput): Promise<RateLimitDecision> {
  const policy = RATE_LIMIT_POLICIES[input.operation]
  const nowMs = input.now?.() ?? Date.now()
  const identity = await bucketIdentity(input)
  const retrySeconds = retryAfter(nowMs, policy.windowSeconds)

  try {
    const result = await consumeDimensions(
      input.store,
      input.operation,
      identity,
      policy,
      policy.limit,
      nowMs,
      false,
    )
    if (!result.limitedBy) return allowedDecision(policy.limit, result.counts, false)

    await input.audit?.(securityEvent('RATE_LIMITED', input.requestId, identity))
    return deniedDecision(policy.limit, retrySeconds, false, result.limitedBy, 429)
  } catch {
    await input.audit?.(securityEvent('RATE_LIMIT_STORE_UNAVAILABLE', input.requestId, identity))
  }

  if (policy.degradedLimit === 0) {
    return deniedDecision(policy.limit, 30, false, 'store', 503)
  }

  try {
    const result = await consumeDimensions(
      input.degradedStore ?? defaultDegradedStore,
      input.operation,
      identity,
      policy,
      policy.degradedLimit,
      nowMs,
      true,
    )
    if (!result.limitedBy) {
      await input.audit?.(securityEvent('RATE_LIMIT_DEGRADED', input.requestId, identity))
      return allowedDecision(policy.degradedLimit, result.counts, true)
    }

    await input.audit?.(securityEvent('RATE_LIMITED', input.requestId, identity))
    return deniedDecision(policy.degradedLimit, retrySeconds, true, result.limitedBy, 429)
  } catch {
    return deniedDecision(policy.degradedLimit, 30, true, 'store', 503)
  }
}
