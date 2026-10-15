import { createClerkClient } from '@clerk/backend'

import { ApiFailure, requestIdFor } from './http.ts'

type GatewayAuthState = {
  isAuthenticated: boolean
  reason: string | null
  toAuth: () => {
    userId?: unknown
    sessionId?: unknown
    sessionClaims?: unknown
  }
}

type GatewayAuthenticate = (
  request: Request,
  options: {
    acceptsToken: 'session_token'
    audience: string
    authorizedParties: readonly string[]
    jwtKey: string
  },
) => Promise<GatewayAuthState>

export type GatewayAuthConfig = {
  secretKey: string
  publishableKey: string
  jwtKey: string
  audience: string
  issuer: string
  authorizedParties: readonly string[]
  now?: () => number
  authenticate?: GatewayAuthenticate
}

export type VerifiedPrincipal = {
  ownerId: string
  sessionId: string
  requestId: string
  factorVerificationAge: readonly [number, number] | null
}

function hasBearerToken(request: Request): boolean {
  const authorization = request.headers.get('authorization')
  return authorization !== null && /^Bearer\s+\S+$/i.test(authorization)
}

function hasAudience(value: unknown, expected: string): boolean {
  return value === expected || (Array.isArray(value) && value.some((item) => item === expected))
}

function claimsRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ApiFailure(401, 'AUTH_INVALID', 'Authentication token is invalid.')
  }
  return value as Record<string, unknown>
}

function factorVerificationAge(value: unknown): readonly [number, number] | null {
  if (value === undefined) return null
  if (
    !Array.isArray(value)
    || value.length !== 2
    || value.some((age) => typeof age !== 'number' || !Number.isFinite(age) || (age !== -1 && age < 0))
  ) {
    throw new ApiFailure(401, 'AUTH_INVALID', 'Authentication token is invalid.')
  }
  return [value[0] as number, value[1] as number]
}

export async function authenticateRequest(
  request: Request,
  config: GatewayAuthConfig,
): Promise<VerifiedPrincipal> {
  if (!hasBearerToken(request)) {
    throw new ApiFailure(401, 'AUTH_REQUIRED', 'Sign in required.')
  }

  const authenticate = config.authenticate ?? (() => {
    const clerk = createClerkClient({
      secretKey: config.secretKey,
      publishableKey: config.publishableKey,
      jwtKey: config.jwtKey,
      telemetry: { disabled: true },
    })
    return ((authRequest, options) => clerk.authenticateRequest(authRequest, {
      ...options,
      authorizedParties: [...options.authorizedParties],
    })) as GatewayAuthenticate
  })()

  const authState = await authenticate(request, {
    acceptsToken: 'session_token',
    audience: config.audience,
    authorizedParties: config.authorizedParties,
    jwtKey: config.jwtKey,
  })

  if (!authState.isAuthenticated) {
    const expired = authState.reason?.toLowerCase().includes('expired')
    throw new ApiFailure(
      401,
      expired ? 'TOKEN_EXPIRED' : 'AUTH_INVALID',
      expired ? 'Authentication token has expired.' : 'Authentication token is invalid.',
    )
  }

  const auth = authState.toAuth()
  const claims = claimsRecord(auth.sessionClaims)
  const now = config.now?.() ?? Math.floor(Date.now() / 1000)

  if (typeof claims.exp !== 'number' || !Number.isFinite(claims.exp) || claims.exp <= now) {
    throw new ApiFailure(401, 'TOKEN_EXPIRED', 'Authentication token has expired.')
  }
  if (claims.iss !== config.issuer) {
    throw new ApiFailure(403, 'TOKEN_ISSUER', 'Authentication token issuer is not allowed.')
  }
  if (!hasAudience(claims.aud, config.audience)) {
    throw new ApiFailure(403, 'TOKEN_AUDIENCE', 'Authentication token audience is not allowed.')
  }
  if (typeof claims.azp !== 'string' || !config.authorizedParties.includes(claims.azp)) {
    throw new ApiFailure(403, 'TOKEN_PARTY', 'Authentication token party is not allowed.')
  }
  if (claims.sts === 'pending') {
    throw new ApiFailure(403, 'SESSION_PENDING', 'Authentication setup is incomplete.')
  }
  if (
    typeof auth.userId !== 'string'
    || auth.userId.length === 0
    || claims.sub !== auth.userId
    || typeof auth.sessionId !== 'string'
    || auth.sessionId.length === 0
    || (claims.sid !== undefined && claims.sid !== auth.sessionId)
  ) {
    throw new ApiFailure(401, 'AUTH_INVALID', 'Authentication token is invalid.')
  }

  return {
    ownerId: auth.userId,
    sessionId: auth.sessionId,
    requestId: requestIdFor(request),
    factorVerificationAge: factorVerificationAge(claims.fva),
  }
}
