import { describe, expect, it, vi } from 'vitest'

import {
  handleClerkUserDeleted,
  requestAccountDeletion,
  resumeAccountDeletion,
  verifyWebhookSignature,
  type DeletionDatabase,
  type ClerkClient,
} from './deletionService.ts'
import { ApiFailure } from './http.ts'

const TEST_OWNER = 'user_del_12345'
const TEST_SECRET = 'whsec_mf9W4K085m+iA1Y9lq7W4K085m+iA1Y9' // Base64 32 bytes

function mockDatabase(overrides: Partial<DeletionDatabase> = {}): DeletionDatabase {
  return {
    purgeOwnerData: vi.fn(async () => ({
      recordsDeleted: 15,
      devicesDeleted: 2,
      operationsDeleted: 5,
      conflictsDeleted: 1,
    })),
    recordDeletionIntent: vi.fn(async () => {}),
    ...overrides,
  }
}

function mockClerk(success = true): ClerkClient {
  return {
    deleteUser: vi.fn(async () => {
      if (!success) throw new Error('Clerk API unavailable')
      return true
    }),
  }
}

describe('deletionService', () => {
  it('requires explicit "DELETE" confirmation string', async () => {
    const db = mockDatabase()
    await expect(
      requestAccountDeletion({ ownerId: TEST_OWNER, database: db }, 'no'),
    ).rejects.toThrow(ApiFailure)
    expect(db.purgeOwnerData).not.toHaveBeenCalled()
  })

  it('purges owner data and triggers Clerk deletion when confirmed', async () => {
    const db = mockDatabase()
    const clerk = mockClerk(true)
    const result = await requestAccountDeletion(
      { ownerId: TEST_OWNER, database: db, clerkClient: clerk },
      'DELETE',
    )

    expect(result.success).toBe(true)
    expect(result.ownerId).toBe(TEST_OWNER)
    expect(db.purgeOwnerData).toHaveBeenCalledWith(TEST_OWNER)
    expect(clerk.deleteUser).toHaveBeenCalledWith(TEST_OWNER)
    expect(db.recordDeletionIntent).toHaveBeenCalledWith(TEST_OWNER, 'completed')
  })

  it('records failure and allows retry if Clerk deletion fails after database purge', async () => {
    const db = mockDatabase()
    const clerk = mockClerk(false)

    await expect(
      requestAccountDeletion(
        { ownerId: TEST_OWNER, database: db, clerkClient: clerk },
        'DELETE',
      ),
    ).rejects.toThrow(/Database purged but Clerk identity deletion failed/)

    expect(db.purgeOwnerData).toHaveBeenCalledWith(TEST_OWNER)
    expect(db.recordDeletionIntent).toHaveBeenCalledWith(TEST_OWNER, 'failed')

    // Resuming deletion succeeds when Clerk recovers
    const recoveredClerk = mockClerk(true)
    const resumed = await resumeAccountDeletion({
      ownerId: TEST_OWNER,
      database: db,
      clerkClient: recoveredClerk,
    })
    expect(resumed.success).toBe(true)
    expect(recoveredClerk.deleteUser).toHaveBeenCalledWith(TEST_OWNER)
  })

  it('handles Clerk user.deleted webhook idempotently', async () => {
    const db = mockDatabase()
    const result = await handleClerkUserDeleted(db, TEST_OWNER)

    expect(result.success).toBe(true)
    expect(db.purgeOwnerData).toHaveBeenCalledWith(TEST_OWNER)
  })

  it('verifies valid Svix webhook signatures and rejects expired or tampered signatures', async () => {
    const nowSec = 1700000000
    const body = JSON.stringify({ type: 'user.deleted', data: { id: TEST_OWNER } })
    const svixId = 'msg_test_123'
    const svixTimestamp = `${nowSec}`

    // Compute legitimate signature using the secret
    const secretBytes = Uint8Array.from(atob(TEST_SECRET.replace(/^whsec_/, '')), (c) => c.charCodeAt(0))
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      secretBytes,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    )
    const toSign = `${svixId}.${svixTimestamp}.${body}`
    const sigBytes = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(toSign))
    const validBase64 = btoa(String.fromCharCode(...new Uint8Array(sigBytes)))

    const validHeaders = new Headers({
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': `v1,${validBase64}`,
    })

    const verified = await verifyWebhookSignature(body, validHeaders, {
      signingSecret: TEST_SECRET,
      now: nowSec * 1000,
      toleranceSeconds: 300,
    })
    expect(verified).toBe(true)

    // Expired timestamp
    const expiredHeaders = new Headers({
      'svix-id': svixId,
      'svix-timestamp': `${nowSec - 400}`,
      'svix-signature': `v1,${validBase64}`,
    })
    await expect(
      verifyWebhookSignature(body, expiredHeaders, {
        signingSecret: TEST_SECRET,
        now: nowSec * 1000,
        toleranceSeconds: 300,
      }),
    ).rejects.toThrow(ApiFailure)

    // Tampered body or invalid signature
    const tamperedHeaders = new Headers({
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': `v1,invalidBase64Sig==`,
    })
    await expect(
      verifyWebhookSignature(body, tamperedHeaders, {
        signingSecret: TEST_SECRET,
        now: nowSec * 1000,
        toleranceSeconds: 300,
      }),
    ).rejects.toThrow(ApiFailure)
  })
})
