import { parsePullResponse } from '../../../src/sync/schemas.ts'
import type { PullRequest, PullResponse } from '../../../src/sync/types.ts'
import type { VerifiedPrincipal } from './auth.ts'
import { DatabaseFailure, type PullDatabase } from './database.ts'
import { ApiFailure } from './http.ts'

const CURSOR_VERSION = 'v1'
const CURSOR_AAD = new TextEncoder().encode('tend-sync-cursor-v1')
const MAX_CURSOR_LENGTH = 512
const MAX_BIGINT = 9_223_372_036_854_775_807n

type CursorState = {
  sequence: string | null
  recordId: string
  bootstrap: boolean
}

type CursorPayload = {
  v: 1
  owner: string
  sequence: string
  recordId: string
  bootstrap: boolean
}

export type PullServiceContext = {
  principal: VerifiedPrincipal
  database: PullDatabase
  cursorSecret: string
  randomBytes?: (length: number) => Uint8Array
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function base64UrlDecode(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid base64url')
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4)
  const binary = atob(padded)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

function exactBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

async function cursorKey(secret: string): Promise<CryptoKey> {
  if (secret.length < 32) throw new Error('Cursor secret must contain at least 32 characters.')
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret))
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

function validSequence(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{1,19}$/.test(value)) return false
  try {
    return BigInt(value) <= MAX_BIGINT
  } catch {
    return false
  }
}

function validCursorPayload(value: unknown, ownerId: string): value is CursorPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const payload = value as Record<string, unknown>
  return Object.keys(payload).sort().join(',') === 'bootstrap,owner,recordId,sequence,v'
    && payload.v === 1
    && payload.owner === ownerId
    && validSequence(payload.sequence)
    && typeof payload.recordId === 'string'
    && payload.recordId.length <= 128
    && typeof payload.bootstrap === 'boolean'
}

async function encodeCursor(
  state: { sequence: string; recordId: string; bootstrap: boolean },
  ownerId: string,
  secret: string,
  randomBytes?: (length: number) => Uint8Array,
): Promise<string> {
  const iv = randomBytes?.(12) ?? crypto.getRandomValues(new Uint8Array(12))
  if (iv.byteLength !== 12) throw new Error('Cursor nonce must contain 12 bytes.')
  const plaintext = new TextEncoder().encode(JSON.stringify({
    v: 1,
    owner: ownerId,
    sequence: state.sequence,
    recordId: state.recordId,
    bootstrap: state.bootstrap,
  } satisfies CursorPayload))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: exactBuffer(iv), additionalData: CURSOR_AAD, tagLength: 128 },
    await cursorKey(secret),
    plaintext,
  )
  const cursor = `${CURSOR_VERSION}.${base64UrlEncode(iv)}.${base64UrlEncode(new Uint8Array(ciphertext))}`
  if (cursor.length > MAX_CURSOR_LENGTH) throw new Error('Encoded cursor exceeds its protocol limit.')
  return cursor
}

async function decodeCursor(cursor: string, ownerId: string, secret: string): Promise<CursorState> {
  if (cursor.length < 1 || cursor.length > MAX_CURSOR_LENGTH) {
    throw new ApiFailure(422, 'CURSOR_INVALID', 'The synchronization cursor is invalid.')
  }

  try {
    const [version, ivValue, ciphertextValue, extra] = cursor.split('.')
    if (version !== CURSOR_VERSION || !ivValue || !ciphertextValue || extra !== undefined) throw new Error('Invalid cursor')
    const iv = base64UrlDecode(ivValue)
    const ciphertext = base64UrlDecode(ciphertextValue)
    if (iv.byteLength !== 12 || ciphertext.byteLength < 17) throw new Error('Invalid cursor')
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: exactBuffer(iv), additionalData: CURSOR_AAD, tagLength: 128 },
      await cursorKey(secret),
      exactBuffer(ciphertext),
    )
    const payload: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plaintext))
    if (!validCursorPayload(payload, ownerId)) throw new Error('Invalid cursor')
    return { sequence: payload.sequence, recordId: payload.recordId, bootstrap: payload.bootstrap }
  } catch (error) {
    if (error instanceof ApiFailure) throw error
    throw new ApiFailure(422, 'CURSOR_INVALID', 'The synchronization cursor is invalid.')
  }
}

function mappedFailure(error: unknown): never {
  if (!(error instanceof DatabaseFailure)) throw error
  switch (error.code) {
    case 'CURSOR_EXPIRED':
      throw new ApiFailure(410, 'CURSOR_EXPIRED', 'The synchronization cursor has expired.')
    case 'DEVICE_UNKNOWN':
      throw new ApiFailure(403, 'DEVICE_UNKNOWN', 'Register this device before synchronizing.')
    case 'DEVICE_REVOKED':
      throw new ApiFailure(403, 'DEVICE_REVOKED', 'This device no longer has synchronization access.')
    case 'DATABASE_RESPONSE_INVALID':
      throw new ApiFailure(500, 'DATABASE_RESPONSE_INVALID', 'The synchronization service returned an invalid response.')
    default:
      throw new ApiFailure(503, 'SYNC_UNAVAILABLE', 'Synchronization is temporarily unavailable.', {
        'Retry-After': '5',
      })
  }
}

function cursorAdvanced(previous: CursorState, nextSequence: string, nextRecordId: string): boolean {
  if (previous.sequence === null) return true
  const previousSequence = BigInt(previous.sequence)
  const next = BigInt(nextSequence)
  return next > previousSequence || (next === previousSequence && nextRecordId >= previous.recordId)
}

export async function pullChanges(
  context: PullServiceContext,
  request: PullRequest,
): Promise<PullResponse> {
  if (!Number.isSafeInteger(request.limit) || request.limit < 1 || request.limit > 500) {
    throw new ApiFailure(422, 'PAGE_LIMIT_INVALID', 'Pull page size must be between 1 and 500.')
  }
  if (context.cursorSecret.length < 32) throw new Error('Cursor encryption is not configured safely.')

  const previous = request.cursor !== undefined
    ? await decodeCursor(request.cursor, context.principal.ownerId, context.cursorSecret)
    : { sequence: null, recordId: '', bootstrap: true }

  try {
    const page = await context.database.pullChanges({
      ownerId: context.principal.ownerId,
      deviceId: request.deviceId,
      afterSequence: previous.sequence,
      afterRecordId: previous.recordId,
      bootstrap: previous.bootstrap,
      limit: request.limit,
    })
    if (!cursorAdvanced(previous, page.nextSequence, page.nextRecordId)) {
      throw new DatabaseFailure('DATABASE_RESPONSE_INVALID')
    }
    if (
      page.records.length === 0
      && previous.sequence !== null
      && !previous.bootstrap
      && (page.nextSequence !== previous.sequence || page.nextRecordId !== previous.recordId)
    ) {
      throw new DatabaseFailure('DATABASE_RESPONSE_INVALID')
    }

    const cursor = page.records.length === 0 && request.cursor !== undefined && !previous.bootstrap
      ? request.cursor
      : await encodeCursor(
        {
          sequence: page.nextSequence,
          recordId: page.nextRecordId,
          bootstrap: previous.bootstrap && page.hasMore,
        },
        context.principal.ownerId,
        context.cursorSecret,
        context.randomBytes,
      )
    return parsePullResponse({ records: page.records, cursor, hasMore: page.hasMore })
  } catch (error) {
    return mappedFailure(error)
  }
}
