import { createClient } from '@supabase/supabase-js'

import { ApiFailure, errorResponse, jsonResponse } from '../_shared/http.ts'
import { handleClerkUserDeleted, verifyWebhookSignature, type DeletionDatabase } from '../_shared/deletionService.ts'

export function createDeletionDatabase(client: ReturnType<typeof createClient>): DeletionDatabase {
  return {
    async purgeOwnerData(ownerId: string) {
      // Cascade delete deletes related records in PostgreSQL, but we delete explicitly across tables
      const [recordsRes, devicesRes, opsRes, conflictsRes, retentionRes] = await Promise.all([
        client.from('user_records').delete().eq('owner_id', ownerId),
        client.from('devices').delete().eq('owner_id', ownerId),
        client.from('sync_operations').delete().eq('owner_id', ownerId),
        client.from('sync_conflicts').delete().eq('owner_id', ownerId),
        client.from('sync_retention_state').delete().eq('owner_id', ownerId),
      ])

      if (recordsRes.error) throw new ApiFailure(500, 'DATABASE_ERROR', recordsRes.error.message)
      if (devicesRes.error) throw new ApiFailure(500, 'DATABASE_ERROR', devicesRes.error.message)

      return {
        recordsDeleted: recordsRes.count ?? 0,
        devicesDeleted: devicesRes.count ?? 0,
        operationsDeleted: opsRes.count ?? 0,
        conflictsDeleted: conflictsRes.count ?? 0,
      }
    },
  }
}

export async function handleWebhookRequest(
  request: Request,
  dependencies: {
    signingSecret: string
    database: DeletionDatabase
  },
): Promise<Response> {
  if (request.method !== 'POST') {
    return errorResponse(new ApiFailure(405, 'METHOD_NOT_ALLOWED', 'Only POST is permitted for webhooks.'))
  }

  const rawBody = await request.text()
  try {
    await verifyWebhookSignature(rawBody, request.headers, {
      signingSecret: dependencies.signingSecret,
    })

    const payload = JSON.parse(rawBody)
    if (payload.type === 'user.deleted' && payload.data?.id) {
      await handleClerkUserDeleted(dependencies.database, payload.data.id)
    }

    return jsonResponse({ received: true }, 200)
  } catch (error) {
    return errorResponse(error)
  }
}

export default async function handler(req: Request): Promise<Response> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const signingSecret = Deno.env.get('CLERK_WEBHOOK_SIGNING_SECRET') ?? ''

  const client = createClient(supabaseUrl, serviceRoleKey)
  const database = createDeletionDatabase(client)

  return handleWebhookRequest(req, {
    signingSecret,
    database,
  })
}
