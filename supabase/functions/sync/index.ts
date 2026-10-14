import { Redis } from '@upstash/redis'
import { createClient } from '@supabase/supabase-js'

import { parsePullRequest, parsePushRequest } from '../../../src/sync/schemas.ts'
import type { PullRequest, PullResponse, PushRequest, PushResponse } from '../../../src/sync/types.ts'
import { authenticateRequest, type GatewayAuthConfig, type VerifiedPrincipal } from '../_shared/auth.ts'
import { recordSecurityEvent } from '../_shared/audit.ts'
import { createSyncDatabase, type SupabaseRpcClient } from '../_shared/database.ts'
import {
  ApiFailure,
  errorResponse,
  handlePreflight,
  jsonResponse,
  readJsonBody,
} from '../_shared/http.ts'
import { pushOperations } from '../_shared/pushService.ts'
import { pullChanges } from '../_shared/pullService.ts'
import {
  clientIpFromSupabaseGateway,
  createUpstashRateLimitStore,
  enforceRateLimit,
  type RateLimitDecision,
  type RedisEvalClient,
} from '../_shared/rateLimit.ts'

const MAX_PUSH_BODY_BYTES = 262_144

type LimitInput = {
  principal: VerifiedPrincipal
  deviceId: string
  clientIp: string
  operation: 'pull' | 'push'
}

export type SyncHandlerDependencies = {
  allowedOrigins: readonly string[]
  authenticate(request: Request): Promise<VerifiedPrincipal>
  clientIp(request: Request): string
  limit(input: LimitInput): Promise<RateLimitDecision>
  push(principal: VerifiedPrincipal, request: PushRequest): Promise<PushResponse>
  pull(principal: VerifiedPrincipal, request: PullRequest): Promise<PullResponse>
  logger?: (entry: {
    level: 'error'
    requestId: string
    status: number
    code: string
    errorName: string
  }) => void
}

function assertOrigin(request: Request, allowedOrigins: readonly string[]): string | null {
  const origin = request.headers.get('origin')
  if (origin !== null && !allowedOrigins.includes(origin)) {
    throw new ApiFailure(403, 'ORIGIN_DENIED', 'Request origin is not allowed.')
  }
  return origin
}

function isPushPath(pathname: string): boolean {
  return pathname === '/sync/push' || pathname.endsWith('/functions/v1/sync/push')
}

function isPullPath(pathname: string): boolean {
  return pathname === '/sync/pull' || pathname.endsWith('/functions/v1/sync/pull')
}

function parsedPullRequest(url: URL): PullRequest {
  const allowed = new Set(['deviceId', 'cursor', 'limit'])
  for (const key of url.searchParams.keys()) {
    if (!allowed.has(key) || url.searchParams.getAll(key).length !== 1) {
      throw new ApiFailure(422, 'VALIDATION_FAILED', 'The synchronization request is invalid.')
    }
  }
  const cursor = url.searchParams.get('cursor')
  const limitValue = url.searchParams.get('limit')
  try {
    return parsePullRequest({
      deviceId: url.searchParams.get('deviceId'),
      ...(cursor === null ? {} : { cursor }),
      limit: limitValue === null ? 100 : Number(limitValue),
    })
  } catch {
    throw new ApiFailure(422, 'VALIDATION_FAILED', 'The synchronization request is invalid.')
  }
}

export function createSyncHandler(dependencies: SyncHandlerDependencies) {
  return async (request: Request): Promise<Response> => {
    try {
      const preflight = handlePreflight(request, dependencies.allowedOrigins)
      if (preflight) return preflight

      const origin = assertOrigin(request, dependencies.allowedOrigins)
      const url = new URL(request.url)
      const pushRoute = isPushPath(url.pathname)
      const pullRoute = isPullPath(url.pathname)
      if (!pushRoute && !pullRoute) {
        throw new ApiFailure(404, 'NOT_FOUND', 'The requested synchronization endpoint does not exist.')
      }
      const expectedMethod = pushRoute ? 'POST' : 'GET'
      if (request.method !== expectedMethod) {
        throw new ApiFailure(405, 'METHOD_NOT_ALLOWED', `This endpoint requires ${expectedMethod}.`, { Allow: expectedMethod })
      }

      // Authentication intentionally precedes body reads and parsing.
      const principal = await dependencies.authenticate(request)
      let syncRequest: PushRequest | PullRequest
      if (pushRoute) {
        const rawBody = await readJsonBody(request, MAX_PUSH_BODY_BYTES)
        try {
          syncRequest = parsePushRequest(rawBody)
        } catch {
          throw new ApiFailure(422, 'VALIDATION_FAILED', 'The synchronization request is invalid.')
        }
      } else {
        syncRequest = parsedPullRequest(url)
      }

      let clientIp: string
      try {
        clientIp = dependencies.clientIp(request)
      } catch {
        throw new ApiFailure(400, 'CLIENT_ADDRESS_REQUIRED', 'A trusted gateway client address is required.')
      }

      const decision = await dependencies.limit({
        principal,
        deviceId: syncRequest.deviceId,
        clientIp,
        operation: pushRoute ? 'push' : 'pull',
      })
      if (!decision.allowed) {
        throw new ApiFailure(
          decision.status ?? 429,
          decision.status === 503 ? 'RATE_LIMIT_UNAVAILABLE' : 'RATE_LIMITED',
          decision.status === 503
            ? 'Synchronization protection is temporarily unavailable.'
            : 'Too many synchronization requests.',
          decision.headers,
        )
      }

      const response = pushRoute
        ? await dependencies.push(principal, syncRequest as PushRequest)
        : await dependencies.pull(principal, syncRequest as PullRequest)
      return jsonResponse(response, {
        status: 200,
        requestId: principal.requestId,
        origin,
        allowedOrigins: dependencies.allowedOrigins,
      })
    } catch (error) {
      return errorResponse(error, {
        request,
        allowedOrigins: dependencies.allowedOrigins,
        logger: dependencies.logger,
      })
    }
  }
}

type EdgeRuntime = {
  env: { get(name: string): string | undefined }
  serve(handler: (request: Request) => Response | Promise<Response>): void
}

function requiredEnvironment(env: EdgeRuntime['env'], name: string): string {
  const value = env.get(name)
  if (!value || value.trim() !== value) throw new Error(`Missing or invalid server environment: ${name}`)
  return value
}

function commaSeparated(value: string): string[] {
  const entries = value.split(',').map((entry) => entry.trim()).filter(Boolean)
  if (entries.length === 0 || new Set(entries).size !== entries.length) {
    throw new Error('Server origin allowlist is invalid.')
  }
  for (const entry of entries) new URL(entry)
  return entries
}

function runtimeHandler(env: EdgeRuntime['env']) {
  const allowedOrigins = commaSeparated(requiredEnvironment(env, 'TEND_ALLOWED_ORIGINS'))
  const authorizedParties = commaSeparated(requiredEnvironment(env, 'TEND_CLERK_AUTHORIZED_PARTIES'))
  const authConfig: GatewayAuthConfig = {
    secretKey: requiredEnvironment(env, 'CLERK_SECRET_KEY'),
    publishableKey: requiredEnvironment(env, 'CLERK_PUBLISHABLE_KEY'),
    jwtKey: requiredEnvironment(env, 'CLERK_JWT_KEY'),
    audience: requiredEnvironment(env, 'TEND_CLERK_AUDIENCE'),
    issuer: requiredEnvironment(env, 'TEND_CLERK_ISSUER'),
    authorizedParties,
  }

  const supabase = createClient(
    requiredEnvironment(env, 'SUPABASE_URL'),
    requiredEnvironment(env, 'SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  )
  const database = createSyncDatabase(supabase as unknown as SupabaseRpcClient)
  const redis = new Redis({
    url: requiredEnvironment(env, 'UPSTASH_REDIS_REST_URL'),
    token: requiredEnvironment(env, 'UPSTASH_REDIS_REST_TOKEN'),
  })
  const rateStore = createUpstashRateLimitStore(redis as unknown as RedisEvalClient)
  const keySecret = requiredEnvironment(env, 'TEND_RATE_LIMIT_KEY_SECRET')
  const cursorSecret = requiredEnvironment(env, 'TEND_CURSOR_SECRET')

  return createSyncHandler({
    allowedOrigins,
    authenticate: (request) => authenticateRequest(request, authConfig),
    clientIp: clientIpFromSupabaseGateway,
    limit: ({ principal, deviceId, clientIp, operation }) => enforceRateLimit({
      ownerId: principal.ownerId,
      deviceId,
      clientIp,
      requestId: principal.requestId,
      operation,
      keySecret,
      store: rateStore,
      audit: (event) => recordSecurityEvent(event),
    }),
    push: (principal, request) => pushOperations({ principal, database }, request),
    pull: (principal, request) => pullChanges({ principal, database, cursorSecret }, request),
    logger: (entry) => console.error(JSON.stringify(entry)),
  })
}

const edgeRuntime = (globalThis as typeof globalThis & { Deno?: EdgeRuntime }).Deno
if (edgeRuntime) edgeRuntime.serve(runtimeHandler(edgeRuntime.env))
