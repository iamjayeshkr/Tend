import { describe, expect, it, vi } from 'vitest'

import { authenticateRequest, type GatewayAuthConfig } from './auth'
import {
  ApiFailure,
  errorResponse,
  handlePreflight,
  jsonResponse,
  readJsonBody,
  requestIdFor,
} from './http'

const allowedOrigins = ['https://app.tend.example', 'http://127.0.0.1:4173']
const nowSeconds = 1_792_000_000

function authState(claims: Record<string, unknown>, authenticated = true, reason = 'token-invalid') {
  return authenticated
    ? {
        isAuthenticated: true,
        reason: null,
        toAuth: () => ({ userId: claims.sub, sessionId: claims.sid, sessionClaims: claims }),
      }
    : { isAuthenticated: false, reason, toAuth: () => ({}) }
}

function authConfig(claims?: Record<string, unknown>): GatewayAuthConfig {
  return {
    secretKey: 'sk_test_server_only',
    publishableKey: 'pk_test_public',
    jwtKey: '-----BEGIN PUBLIC KEY-----\nnetworkless\n-----END PUBLIC KEY-----',
    audience: 'tend-sync',
    issuer: 'https://clerk.tend.example',
    authorizedParties: allowedOrigins,
    now: () => nowSeconds,
    authenticate: vi.fn(async () => authState(claims ?? {
      sub: 'user_a', sid: 'session_a', iss: 'https://clerk.tend.example', aud: 'tend-sync',
      azp: 'https://app.tend.example', exp: nowSeconds + 60,
    })),
  }
}

const request = (token = 'valid', origin = 'https://app.tend.example') => new Request('https://edge.tend.example/sync', {
  headers: { authorization: `Bearer ${token}`, origin, 'x-request-id': 'request-123' },
})

describe('authenticateRequest', () => {
  it('rejects missing authorization before invoking Clerk', async () => {
    const config = authConfig()
    await expect(authenticateRequest(new Request('https://edge.tend.example/sync'), config)).rejects.toMatchObject({ status: 401, code: 'AUTH_REQUIRED' })
    expect(config.authenticate).not.toHaveBeenCalled()
  })

  it.each([
    ['expired', { sub: 'user_a', sid: 's', iss: 'https://clerk.tend.example', aud: 'tend-sync', azp: allowedOrigins[0], exp: nowSeconds - 1 }, 401, 'TOKEN_EXPIRED'],
    ['wrong issuer', { sub: 'user_a', sid: 's', iss: 'https://attacker.example', aud: 'tend-sync', azp: allowedOrigins[0], exp: nowSeconds + 60 }, 403, 'TOKEN_ISSUER'],
    ['wrong audience', { sub: 'user_a', sid: 's', iss: 'https://clerk.tend.example', aud: 'other', azp: allowedOrigins[0], exp: nowSeconds + 60 }, 403, 'TOKEN_AUDIENCE'],
    ['missing authorized party', { sub: 'user_a', sid: 's', iss: 'https://clerk.tend.example', aud: 'tend-sync', exp: nowSeconds + 60 }, 403, 'TOKEN_PARTY'],
    ['unapproved authorized party', { sub: 'user_a', sid: 's', iss: 'https://clerk.tend.example', aud: 'tend-sync', azp: 'https://evil.example', exp: nowSeconds + 60 }, 403, 'TOKEN_PARTY'],
  ])('rejects %s claims', async (_name, claims, status, code) => {
    await expect(authenticateRequest(request(), authConfig(claims))).rejects.toMatchObject({ status, code })
  })

  it('returns a verified principal and passes all networkless Clerk constraints', async () => {
    const config = authConfig()
    await expect(authenticateRequest(request(), config)).resolves.toEqual({
      ownerId: 'user_a', sessionId: 'session_a', requestId: 'request-123',
    })
    expect(config.authenticate).toHaveBeenCalledWith(expect.any(Request), expect.objectContaining({
      acceptsToken: 'session_token',
      audience: 'tend-sync',
      authorizedParties: allowedOrigins,
      jwtKey: config.jwtKey,
    }))
  })
})

describe('HTTP boundary', () => {
  it('allows only exact-origin preflights', () => {
    const accepted = handlePreflight(new Request('https://edge.tend.example/sync', {
      method: 'OPTIONS',
      headers: {
        origin: 'https://app.tend.example',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'authorization, content-type, x-request-id',
      },
    }), allowedOrigins)
    expect(accepted?.status).toBe(204)
    expect(accepted?.headers.get('access-control-allow-origin')).toBe('https://app.tend.example')
    expect(accepted?.headers.get('access-control-allow-credentials')).toBeNull()
    expect(() => handlePreflight(new Request('https://edge.tend.example/sync', {
      method: 'OPTIONS', headers: { origin: 'https://app.tend.example.evil' },
    }), allowedOrigins)).toThrow(expect.objectContaining({ status: 403, code: 'ORIGIN_DENIED' }))
  })

  it('rejects oversized bodies before parsing and maps safe 413 responses', async () => {
    const oversized = new Request('https://edge.tend.example/sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': '70000' },
      body: '{}',
    })
    await expect(readJsonBody(oversized, 65_536)).rejects.toMatchObject({ status: 413, code: 'BODY_TOO_LARGE' })
    const response = errorResponse(new ApiFailure(413, 'BODY_TOO_LARGE', 'Request body is too large.'), {
      request: oversized, allowedOrigins, logger: vi.fn(),
    })
    expect(response.status).toBe(413)
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'BODY_TOO_LARGE', message: 'Request body is too large.' } })
  })

  it('returns safe 401, 403, and 500 bodies with request ids', async () => {
    for (const failure of [
      new ApiFailure(401, 'AUTH_REQUIRED', 'Sign in required.'),
      new ApiFailure(403, 'FORBIDDEN', 'Request is not allowed.'),
      new Error('database password and raw SQL must never escape'),
    ]) {
      const response = errorResponse(failure, { request: request(), allowedOrigins, logger: vi.fn() })
      const body = await response.json() as { error: { code: string; message: string; requestId: string } }
      expect(body.error.requestId).toBe('request-123')
      expect(JSON.stringify(body)).not.toContain('password')
      expect(response.headers.get('x-request-id')).toBe('request-123')
      expect(response.headers.get('cache-control')).toBe('no-store')
    }
  })

  it('never logs authorization headers or tokens', () => {
    const logger = vi.fn()
    errorResponse(new Error('boom'), { request: request('super-secret-token'), allowedOrigins, logger })
    const output = JSON.stringify(logger.mock.calls)
    expect(output).not.toContain('super-secret-token')
    expect(output).not.toContain('authorization')
    expect(output).toContain('request-123')
  })

  it('sanitizes request ids and emits hardened JSON responses', async () => {
    expect(requestIdFor(new Request('https://edge.test', { headers: { 'x-request-id': '<script>' } }))).toMatch(/^[0-9a-f-]{36}$/)
    const response = jsonResponse({ ok: true }, { status: 200, requestId: 'request-123', origin: allowedOrigins[0], allowedOrigins })
    expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8')
    expect(response.headers.get('access-control-allow-origin')).toBe(allowedOrigins[0])
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    await expect(response.json()).resolves.toEqual({ ok: true })
  })
})
