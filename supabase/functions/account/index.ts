import { Redis } from '@upstash/redis'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { authenticateRequest, type GatewayAuthConfig, type VerifiedPrincipal } from '../_shared/auth.ts'
import {
  exportAccountData,
  listDevices,
  MAX_ACCOUNT_EXPORT_RECORDS,
  revokeDevice,
  type AccountDatabase,
  type AccountExportBundle,
  type DeviceSummary,
} from '../_shared/accountService.ts'
import { recordSecurityEvent } from '../_shared/audit.ts'
import {
  ApiFailure,
  errorResponse,
  handlePreflight,
  jsonResponse,
  readJsonBody,
  requestIdFor,
} from '../_shared/http.ts'
import {
  clientIpFromSupabaseGateway,
  createUpstashRateLimitStore,
  enforceRateLimit,
  type RateLimitDecision,
  type RateLimitOperation,
  type RedisEvalClient,
} from '../_shared/rateLimit.ts'

const MAX_ACCOUNT_BODY_BYTES = 4_096
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type LimitInput = {
  principal: VerifiedPrincipal
  deviceId: string
  clientIp: string
  operation: RateLimitOperation
}

export type AccountHandlerDependencies = {
  allowedOrigins: readonly string[]
  authenticate(request: Request): Promise<VerifiedPrincipal>
  clientIp(request: Request): string
  limit(input: LimitInput): Promise<RateLimitDecision>
  list(principal: VerifiedPrincipal, currentDeviceId: string): Promise<DeviceSummary[]>
  revoke(
    principal: VerifiedPrincipal,
    currentDeviceId: string,
    deviceId: string,
  ): Promise<{ success: boolean; revokedDeviceId: string }>
  exportData(principal: VerifiedPrincipal, currentDeviceId: string): Promise<AccountExportBundle>
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

function accountRoute(pathname: string): 'list' | 'revoke' | 'export' | null {
  if (pathname === '/account/devices' || pathname.endsWith('/functions/v1/account/devices')) return 'list'
  if (pathname === '/account/devices/revoke' || pathname.endsWith('/functions/v1/account/devices/revoke')) return 'revoke'
  if (pathname === '/account/export' || pathname.endsWith('/functions/v1/account/export')) return 'export'
  return null
}

function currentDeviceIdFor(request: Request): string {
  const deviceId = request.headers.get('x-device-id')
  if (!deviceId || !UUID_PATTERN.test(deviceId)) {
    throw new ApiFailure(422, 'DEVICE_REQUIRED', 'A registered device is required.')
  }
  return deviceId
}

function parseRevocationBody(value: unknown): { deviceId: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ApiFailure(422, 'VALIDATION_FAILED', 'The revocation request is invalid.')
  }
  const entries = Object.entries(value as Record<string, unknown>)
  if (entries.length !== 1 || entries[0]?.[0] !== 'deviceId' || typeof entries[0][1] !== 'string') {
    throw new ApiFailure(422, 'VALIDATION_FAILED', 'The revocation request is invalid.')
  }
  return { deviceId: entries[0][1] }
}

function streamedExportResponse(
  bundle: AccountExportBundle,
  principal: VerifiedPrincipal,
  origin: string | null,
  allowedOrigins: readonly string[],
): Response {
  const bytes = new TextEncoder().encode(JSON.stringify(bundle))
  let offset = 0
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.byteLength) {
        controller.close()
        return
      }
      const nextOffset = Math.min(offset + 64 * 1024, bytes.byteLength)
      controller.enqueue(bytes.slice(offset, nextOffset))
      offset = nextOffset
    },
  })
  const template = jsonResponse(null, {
    status: 200,
    requestId: principal.requestId,
    origin,
    allowedOrigins,
  })
  const headers = new Headers(template.headers)
  headers.set('content-disposition', 'attachment; filename="tend-account-export-v1.json"')
  headers.set('content-length', String(bytes.byteLength))
  return new Response(stream, { status: 200, headers })
}

function reverificationResponse(request: Request, allowedOrigins: readonly string[]): Response {
  const requestId = requestIdFor(request)
  return jsonResponse({
    clerk_error: {
      type: 'forbidden',
      reason: 'reverification-error',
      metadata: { reverification: 'strict' },
    },
    error: {
      code: 'REVERIFICATION_REQUIRED',
      message: 'Verify your identity again to continue.',
      requestId,
    },
  }, {
    status: 403,
    requestId,
    origin: request.headers.get('origin'),
    allowedOrigins,
  })
}

export function createAccountHandler(dependencies: AccountHandlerDependencies) {
  return async (request: Request): Promise<Response> => {
    try {
      const preflight = handlePreflight(request, dependencies.allowedOrigins)
      if (preflight) return preflight

      const origin = assertOrigin(request, dependencies.allowedOrigins)
      const route = accountRoute(new URL(request.url).pathname)
      if (!route) throw new ApiFailure(404, 'NOT_FOUND', 'The requested account endpoint does not exist.')
      const expectedMethod = route === 'revoke' ? 'POST' : 'GET'
      if (request.method !== expectedMethod) {
        throw new ApiFailure(405, 'METHOD_NOT_ALLOWED', `This endpoint requires ${expectedMethod}.`, {
          Allow: expectedMethod,
        })
      }

      const principal = await dependencies.authenticate(request)
      const currentDeviceId = currentDeviceIdFor(request)
      const body = route === 'revoke'
        ? parseRevocationBody(await readJsonBody(request, MAX_ACCOUNT_BODY_BYTES))
        : null

      let clientIp: string
      try {
        clientIp = dependencies.clientIp(request)
      } catch {
        throw new ApiFailure(400, 'CLIENT_ADDRESS_REQUIRED', 'A trusted gateway client address is required.')
      }
      const operation: RateLimitOperation = route === 'list' ? 'pull' : route
      const decision = await dependencies.limit({
        principal,
        deviceId: currentDeviceId,
        clientIp,
        operation,
      })
      if (!decision.allowed) {
        throw new ApiFailure(
          decision.status ?? 429,
          decision.status === 503 ? 'RATE_LIMIT_UNAVAILABLE' : 'RATE_LIMITED',
          decision.status === 503
            ? 'Account protection is temporarily unavailable.'
            : 'Too many account requests.',
          decision.headers,
        )
      }

      if (route === 'list') {
        const devices = await dependencies.list(principal, currentDeviceId)
        return jsonResponse(devices, {
          status: 200,
          requestId: principal.requestId,
          origin,
          allowedOrigins: dependencies.allowedOrigins,
        })
      }
      if (route === 'revoke') {
        const result = await dependencies.revoke(principal, currentDeviceId, body!.deviceId)
        return jsonResponse(result, {
          status: 200,
          requestId: principal.requestId,
          origin,
          allowedOrigins: dependencies.allowedOrigins,
        })
      }
      const bundle = await dependencies.exportData(principal, currentDeviceId)
      return streamedExportResponse(bundle, principal, origin, dependencies.allowedOrigins)
    } catch (error) {
      if (error instanceof ApiFailure && error.code === 'REVERIFICATION_REQUIRED') {
        return reverificationResponse(request, dependencies.allowedOrigins)
      }
      return errorResponse(error, {
        request,
        allowedOrigins: dependencies.allowedOrigins,
        logger: dependencies.logger,
      })
    }
  }
}

export function createAccountDatabase(client: SupabaseClient<any>): AccountDatabase {
  return {
    async isDeviceActive(ownerId: string, deviceId: string) {
      const { data, error } = await client
        .from('devices')
        .select('id')
        .eq('owner_id', ownerId)
        .eq('id', deviceId)
        .is('revoked_at', null)
        .maybeSingle()
      if (error) throw new ApiFailure(500, 'DATABASE_ERROR', 'The account request could not be completed.')
      return data !== null
    },
    async listDevices(ownerId: string) {
      const { data, error } = await client
        .from('devices')
        .select('id, display_name, platform, app_version, created_at, last_seen_at, revoked_at')
        .eq('owner_id', ownerId)
        .is('revoked_at', null)
        .order('last_seen_at', { ascending: false })
      if (error) throw new ApiFailure(500, 'DATABASE_ERROR', 'The account request could not be completed.')
      return data ?? []
    },
    async revokeDevice(ownerId: string, deviceId: string) {
      const { data, error } = await client
        .from('devices')
        .update({ revoked_at: new Date().toISOString() })
        .eq('owner_id', ownerId)
        .eq('id', deviceId)
        .is('revoked_at', null)
        .select('id')
      if (error) throw new ApiFailure(500, 'DATABASE_ERROR', 'The account request could not be completed.')
      return (data?.length ?? 0) > 0
    },
    async exportRecords(ownerId: string) {
      const { data, error } = await client
        .from('user_records')
        .select('collection, record_id, revision, data, modified_at')
        .eq('owner_id', ownerId)
        .is('deleted_at', null)
        .order('collection', { ascending: true })
        .order('record_id', { ascending: true })
        .limit(MAX_ACCOUNT_EXPORT_RECORDS + 1)
      if (error) throw new ApiFailure(500, 'DATABASE_ERROR', 'The account request could not be completed.')
      return data ?? []
    },
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
  const authConfig: GatewayAuthConfig = {
    secretKey: requiredEnvironment(env, 'CLERK_SECRET_KEY'),
    publishableKey: requiredEnvironment(env, 'CLERK_PUBLISHABLE_KEY'),
    jwtKey: requiredEnvironment(env, 'CLERK_JWT_KEY'),
    audience: requiredEnvironment(env, 'TEND_CLERK_AUDIENCE'),
    issuer: requiredEnvironment(env, 'TEND_CLERK_ISSUER'),
    authorizedParties: commaSeparated(requiredEnvironment(env, 'TEND_CLERK_AUTHORIZED_PARTIES')),
  }
  const supabase: SupabaseClient<any> = createClient(
    requiredEnvironment(env, 'SUPABASE_URL'),
    requiredEnvironment(env, 'SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  )
  const database = createAccountDatabase(supabase)
  const redis = new Redis({
    url: requiredEnvironment(env, 'UPSTASH_REDIS_REST_URL'),
    token: requiredEnvironment(env, 'UPSTASH_REDIS_REST_TOKEN'),
  })
  const rateStore = createUpstashRateLimitStore(redis as unknown as RedisEvalClient)
  const keySecret = requiredEnvironment(env, 'TEND_RATE_LIMIT_KEY_SECRET')

  return createAccountHandler({
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
    list: (principal, currentDeviceId) => listDevices({ principal, currentDeviceId, database }),
    revoke: (principal, currentDeviceId, deviceId) => revokeDevice(
      { principal, currentDeviceId, database },
      deviceId,
    ),
    exportData: (principal, currentDeviceId) => exportAccountData({ principal, currentDeviceId, database }),
    logger: (entry) => console.error(JSON.stringify(entry)),
  })
}

const edgeRuntime = (globalThis as typeof globalThis & { Deno?: EdgeRuntime }).Deno
if (edgeRuntime) edgeRuntime.serve(runtimeHandler(edgeRuntime.env))
