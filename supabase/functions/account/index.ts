import { createClient } from '@supabase/supabase-js'

import { authenticateRequest, type GatewayAuthConfig, type VerifiedPrincipal } from '../_shared/auth.ts'
import {
  ApiFailure,
  errorResponse,
  handlePreflight,
  jsonResponse,
  readJsonBody,
} from '../_shared/http.ts'
import {
  exportAccountData,
  listDevices,
  revokeDevice,
  type AccountDatabase,
} from '../_shared/accountService.ts'

export function createAccountDatabase(client: ReturnType<typeof createClient>): AccountDatabase {
  return {
    async listDevices(ownerId: string) {
      const { data, error } = await client
        .from('devices')
        .select('id, display_name, platform, app_version, created_at, last_seen_at, revoked_at')
        .eq('owner_id', ownerId)
        .order('last_seen_at', { ascending: false })
      if (error) throw new ApiFailure(500, 'DATABASE_ERROR', error.message)
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
      if (error) throw new ApiFailure(500, 'DATABASE_ERROR', error.message)
      return (data?.length ?? 0) > 0
    },
    async exportRecords(ownerId: string) {
      const { data, error } = await client
        .from('user_records')
        .select('collection, record_id, revision, data, modified_at')
        .eq('owner_id', ownerId)
        .is('deleted_at', null)
      if (error) throw new ApiFailure(500, 'DATABASE_ERROR', error.message)
      return data ?? []
    },
  }
}

export async function handleAccountRequest(
  request: Request,
  dependencies: {
    allowedOrigins: readonly string[]
    authConfig: GatewayAuthConfig
    database: AccountDatabase
  },
): Promise<Response> {
  const preflight = handlePreflight(request, dependencies.allowedOrigins)
  if (preflight) return preflight

  const origin = request.headers.get('origin')
  if (origin && !dependencies.allowedOrigins.includes(origin)) {
    return errorResponse(new ApiFailure(403, 'ORIGIN_DENIED', 'Request origin is not allowed.'), origin)
  }

  try {
    const principal: VerifiedPrincipal = await authenticateRequest(request, dependencies.authConfig)
    const url = new URL(request.url)
    const path = url.pathname
    const currentDeviceId = request.headers.get('x-device-id') ?? undefined

    const context = {
      principal,
      currentDeviceId,
      database: dependencies.database,
    }

    if (request.method === 'GET' && (path.endsWith('/devices') || path.endsWith('/account/devices'))) {
      const devices = await listDevices(context)
      return jsonResponse(devices, 200, origin)
    }

    if (request.method === 'POST' && (path.endsWith('/devices/revoke') || path.endsWith('/account/devices/revoke'))) {
      const body = await readJsonBody<{ deviceId: string }>(request)
      const result = await revokeDevice(context, body?.deviceId ?? '')
      return jsonResponse(result, 200, origin)
    }

    if (request.method === 'GET' && (path.endsWith('/export') || path.endsWith('/account/export'))) {
      const exportBundle = await exportAccountData(context)
      return jsonResponse(exportBundle, 200, origin)
    }

    if (request.method === 'POST' && (path.endsWith('/delete') || path.endsWith('/account/delete'))) {
      const body = await readJsonBody<{ confirmation: string }>(request)
      const { requestAccountDeletion } = await import('../_shared/deletionService.ts')
      const result = await requestAccountDeletion(
        {
          ownerId: principal.ownerId,
          database: {
            async purgeOwnerData(ownerId: string) {
              await dependencies.database.revokeDevice(ownerId, currentDeviceId ?? '')
              return { recordsDeleted: 0, devicesDeleted: 1, operationsDeleted: 0, conflictsDeleted: 0 }
            },
          },
        },
        body?.confirmation ?? '',
      )
      return jsonResponse(result, 200, origin)
    }

    return errorResponse(new ApiFailure(404, 'NOT_FOUND', 'Unknown account operation.'), origin)
  } catch (error) {
    return errorResponse(error, origin)
  }
}

// Default export for Supabase Edge Runtime
export default async function handler(req: Request): Promise<Response> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const clerkIssuer = Deno.env.get('CLERK_ISSUER') ?? ''
  const allowedOrigins = (Deno.env.get('ALLOWED_ORIGINS') ?? 'http://localhost:5173').split(',')

  const client = createClient(supabaseUrl, serviceRoleKey)
  const database = createAccountDatabase(client)

  return handleAccountRequest(req, {
    allowedOrigins,
    authConfig: {
      issuer: clerkIssuer,
      authorizedParties: allowedOrigins,
    },
    database,
  })
}
