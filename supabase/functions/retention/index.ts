import { createClient } from '@supabase/supabase-js'

import { ApiFailure, errorResponse, jsonResponse } from '../_shared/http.ts'
import { purgeExpiredData, type RetentionDatabase } from '../_shared/retentionService.ts'

export function createRetentionDatabase(client: ReturnType<typeof createClient>): RetentionDatabase {
  return {
    async advanceRetentionFloorBeforePurge(cutoff: string) {
      // Find maximum change_sequence of tombstones older than cutoff per owner
      const { data, error } = await client
        .from('user_records')
        .select('owner_id, change_sequence')
        .not('deleted_at', 'is', null)
        .lte('deleted_at', cutoff)
        .order('change_sequence', { ascending: false })

      if (error) throw new ApiFailure(500, 'DATABASE_ERROR', error.message)
      if (!data || data.length === 0) return 0

      const maxSequences = new Map<string, number>()
      for (const row of data) {
        if (!maxSequences.has(row.owner_id)) {
          maxSequences.set(row.owner_id, row.change_sequence)
        }
      }

      let count = 0
      for (const [ownerId, floor] of maxSequences.entries()) {
        const { error: upsertError } = await client
          .from('sync_retention_state')
          .upsert(
            { owner_id: ownerId, cursor_floor: floor, updated_at: new Date().toISOString() },
            { onConflict: 'owner_id' },
          )
        if (!upsertError) count++
      }
      return count
    },

    async purgeExpiredTombstones(cutoff: string, batchLimit = 1000) {
      const { count, error } = await client
        .from('user_records')
        .delete({ count: 'exact' })
        .not('deleted_at', 'is', null)
        .lte('deleted_at', cutoff)
        .limit(batchLimit)

      if (error) throw new ApiFailure(500, 'DATABASE_ERROR', error.message)
      return count ?? 0
    },

    async purgeExpiredOperations(cutoff: string, batchLimit = 1000) {
      const { count, error } = await client
        .from('sync_operations')
        .delete({ count: 'exact' })
        .lte('expires_at', cutoff)
        .limit(batchLimit)

      if (error) throw new ApiFailure(500, 'DATABASE_ERROR', error.message)
      return count ?? 0
    },

    async purgeExpiredConflicts(cutoff: string, batchLimit = 1000) {
      const { count, error } = await client
        .from('sync_conflicts')
        .delete({ count: 'exact' })
        .lte('expires_at', cutoff)
        .limit(batchLimit)

      if (error) throw new ApiFailure(500, 'DATABASE_ERROR', error.message)
      return count ?? 0
    },

    async purgeExpiredSecurityEvents(cutoff: string, batchLimit = 1000) {
      const { count, error } = await client
        .from('security_events')
        .delete({ count: 'exact' })
        .lte('expires_at', cutoff)
        .limit(batchLimit)

      if (error) throw new ApiFailure(500, 'DATABASE_ERROR', error.message)
      return count ?? 0
    },
  }
}

export default async function handler(req: Request): Promise<Response> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const schedulerSecret = Deno.env.get('RETENTION_SCHEDULER_SECRET') ?? ''

  const authHeader = req.headers.get('Authorization') ?? ''
  const providedSecret = authHeader.replace(/^Bearer\s+/i, '').trim() || (req.headers.get('x-retention-secret') ?? '')

  try {
    const client = createClient(supabaseUrl, serviceRoleKey)
    const database = createRetentionDatabase(client)

    const summary = await purgeExpiredData(database, {
      schedulerSecret,
      providedSecret,
    })

    return jsonResponse(summary, 200)
  } catch (error) {
    return errorResponse(error)
  }
}
