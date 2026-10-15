import { ApiFailure } from './http.ts'

export type DeletionDatabase = {
  purgeOwnerData(ownerId: string): Promise<{
    recordsDeleted: number
    devicesDeleted: number
    operationsDeleted: number
    conflictsDeleted: number
  }>
  recordDeletionIntent?(ownerId: string, status: 'pending' | 'completed' | 'failed'): Promise<void>
}

export type ClerkClient = {
  deleteUser(userId: string): Promise<boolean>
}

export type DeletionContext = {
  ownerId: string
  database: DeletionDatabase
  clerkClient?: ClerkClient
}

export type WebhookVerificationOptions = {
  signingSecret: string
  now?: number
  toleranceSeconds?: number
}

export async function verifyWebhookSignature(
  rawBody: string,
  headers: Headers,
  options: WebhookVerificationOptions,
): Promise<boolean> {
  const svixId = headers.get('svix-id')
  const svixTimestamp = headers.get('svix-timestamp')
  const svixSignature = headers.get('svix-signature')

  if (!svixId || !svixTimestamp || !svixSignature) {
    throw new ApiFailure(400, 'WEBHOOK_HEADERS_MISSING', 'Missing required webhook headers.')
  }

  const timestampNum = parseInt(svixTimestamp, 10)
  if (isNaN(timestampNum)) {
    throw new ApiFailure(400, 'WEBHOOK_INVALID_TIMESTAMP', 'Invalid webhook timestamp.')
  }

  const nowSeconds = Math.floor((options.now ?? Date.now()) / 1000)
  const tolerance = options.toleranceSeconds ?? 300
  if (Math.abs(nowSeconds - timestampNum) > tolerance) {
    throw new ApiFailure(400, 'WEBHOOK_TIMESTAMP_EXPIRED', 'Webhook timestamp outside allowed tolerance window.')
  }

  // Parse signing secret (strip whsec_ if present, Svix base64-encodes secrets)
  let secretBytes: Uint8Array
  const secret = options.signingSecret.replace(/^whsec_/, '')
  try {
    secretBytes = Uint8Array.from(atob(secret), (c) => c.charCodeAt(0))
  } catch {
    secretBytes = new TextEncoder().encode(options.signingSecret)
  }

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    secretBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )

  const toSign = `${svixId}.${svixTimestamp}.${rawBody}`
  const signatureBytes = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(toSign))
  const expectedBase64 = btoa(String.fromCharCode(...new Uint8Array(signatureBytes)))

  // Signatures in header can be multiple: "v1,sig1 v1,sig2"
  const passedSignatures = svixSignature.split(' ').map((s) => s.replace(/^v1,/, ''))
  const valid = passedSignatures.includes(expectedBase64)
  if (!valid) {
    throw new ApiFailure(401, 'WEBHOOK_SIGNATURE_INVALID', 'Webhook signature does not match.')
  }

  return true
}

export async function requestAccountDeletion(
  context: DeletionContext,
  confirmationText: string,
): Promise<{ success: boolean; ownerId: string; purgeSummary: any }> {
  if (confirmationText !== 'DELETE') {
    throw new ApiFailure(400, 'CONFIRMATION_REQUIRED', 'Explicit confirmation string "DELETE" is required.')
  }

  if (!context.ownerId || typeof context.ownerId !== 'string') {
    throw new ApiFailure(400, 'INVALID_OWNER', 'Valid owner ID is required.')
  }

  // Record intention before making external API calls
  if (context.database.recordDeletionIntent) {
    await context.database.recordDeletionIntent(context.ownerId, 'pending')
  }

  // 1. Purge all local user records, devices, conflicts, and sync operations in database
  const purgeSummary = await context.database.purgeOwnerData(context.ownerId)

  // 2. Call external Clerk API if client provided
  if (context.clerkClient) {
    try {
      await context.clerkClient.deleteUser(context.ownerId)
    } catch (error) {
      if (context.database.recordDeletionIntent) {
        await context.database.recordDeletionIntent(context.ownerId, 'failed')
      }
      throw new ApiFailure(502, 'CLERK_DELETION_FAILED', 'Database purged but Clerk identity deletion failed. Retry deletion to finish.')
    }
  }

  if (context.database.recordDeletionIntent) {
    await context.database.recordDeletionIntent(context.ownerId, 'completed')
  }

  return {
    success: true,
    ownerId: context.ownerId,
    purgeSummary,
  }
}

export async function resumeAccountDeletion(context: DeletionContext): Promise<{ success: boolean; ownerId: string }> {
  // Idempotent resume: purge remaining data and complete external deletion
  await context.database.purgeOwnerData(context.ownerId)
  if (context.clerkClient) {
    await context.clerkClient.deleteUser(context.ownerId)
  }
  if (context.database.recordDeletionIntent) {
    await context.database.recordDeletionIntent(context.ownerId, 'completed')
  }
  return { success: true, ownerId: context.ownerId }
}

export async function handleClerkUserDeleted(
  database: DeletionDatabase,
  userId: string,
): Promise<{ success: boolean; purged: any }> {
  if (!userId) {
    throw new ApiFailure(400, 'INVALID_USER_ID', 'Missing user ID in webhook.')
  }
  const summary = await database.purgeOwnerData(userId)
  return { success: true, purged: summary }
}
