import { z } from 'zod'

import { parseRemoteRecord, TEND_COLLECTIONS } from '../sync/schemas'
import type { DeviceSummary } from './types'

const MAX_ERROR_BYTES = 32 * 1024
const MAX_EXPORT_RECORDS = 20_000
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ACCOUNT_PATHS = ['/devices', '/devices/revoke', '/export'] as const

type AccountPath = (typeof ACCOUNT_PATHS)[number]
type TokenGetter = (options?: { forceRefresh?: boolean }) => Promise<string | null>

export type AccountExportBundle = {
  version: 1
  exportedAt: string
  ownerId: string
  collections: Record<(typeof TEND_COLLECTIONS)[number], Array<{
    recordId: string
    revision: number
    data: Record<string, unknown>
    modifiedAt: string
  }>>
}

export class AccountRequestError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'AccountRequestError'
    this.status = status
    this.code = code
  }
}

function accountBaseUrl(value: string): URL {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new AccountRequestError(0, 'CONFIGURATION_INVALID', 'Cloud account access is not configured correctly.')
  }
  const isLoopback = url.hostname === 'localhost' || url.hostname === '::1' || url.hostname.startsWith('127.')
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopback)) ||
      url.username || url.password || url.search || url.hash) {
    throw new AccountRequestError(0, 'CONFIGURATION_INVALID', 'Cloud account access is not configured correctly.')
  }
  url.pathname = url.pathname.replace(/\/$/, '')
  return url
}

function safeMessage(status: number): string {
  if (status === 401) return 'Your session has expired. Sign in again to continue.'
  if (status === 403) return 'This account action is not allowed.'
  if (status === 404) return 'The requested account resource was not found.'
  if (status === 413) return 'This account export is too large to download.'
  if (status === 429) return 'Too many requests. Please wait and try again.'
  if (status >= 500) return 'The account service is temporarily unavailable.'
  return 'The account request could not be completed.'
}

async function limitedJson(response: Response, maxBytes = MAX_ERROR_BYTES): Promise<unknown> {
  if (!response.body) return null
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maxBytes) {
        await reader.cancel()
        return null
      }
      chunks.push(value)
    }
  } catch {
    return null
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    return null
  }
}

function isReverificationHint(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const clerkError = (value as Record<string, unknown>).clerk_error
  if (!clerkError || typeof clerkError !== 'object' || Array.isArray(clerkError)) return false
  const record = clerkError as Record<string, unknown>
  return record.type === 'forbidden' && record.reason === 'reverification-error'
}

function errorCode(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'ACCOUNT_REQUEST_FAILED'
  const error = (value as Record<string, unknown>).error
  if (!error || typeof error !== 'object' || Array.isArray(error)) return 'ACCOUNT_REQUEST_FAILED'
  const code = (error as Record<string, unknown>).code
  return typeof code === 'string' && /^[A-Z][A-Z0-9_]{1,63}$/.test(code)
    ? code
    : 'ACCOUNT_REQUEST_FAILED'
}

export function createAccountClient({
  baseUrl,
  deviceId,
  getAccessToken,
  fetch: request = globalThis.fetch,
  requestId = () => crypto.randomUUID(),
  timeoutMs = 15_000,
}: {
  baseUrl: string
  deviceId: string
  getAccessToken: TokenGetter
  fetch?: typeof globalThis.fetch
  requestId?: () => string
  timeoutMs?: number
}) {
  const base = accountBaseUrl(baseUrl)
  if (!UUID_PATTERN.test(deviceId)) {
    throw new AccountRequestError(0, 'DEVICE_INVALID', 'This device could not be identified securely.')
  }

  const send = async (
    path: AccountPath,
    init: { method?: 'GET' | 'POST'; body?: unknown } = {},
  ): Promise<Response> => {
    if (!ACCOUNT_PATHS.includes(path)) {
      throw new AccountRequestError(0, 'PATH_INVALID', 'The account request could not be completed.')
    }
    const id = requestId()
    const attempt = async (forceRefresh: boolean): Promise<Response> => {
      const token = await getAccessToken({ forceRefresh })
      if (!token || token.length > 16_384 || /\s/.test(token)) {
        throw new AccountRequestError(401, 'AUTH_REQUIRED', 'Sign in to continue.')
      }
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), timeoutMs)
      try {
        return await request(new URL(`${base.pathname}${path}`, base).toString(), {
          method: init.method ?? 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            'x-device-id': deviceId,
            'x-request-id': id,
            ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
          },
          body: init.body === undefined ? undefined : JSON.stringify(init.body),
          cache: 'no-store',
          credentials: 'omit',
          signal: controller.signal,
        })
      } catch (error) {
        if (error instanceof AccountRequestError) throw error
        throw new AccountRequestError(0, 'NETWORK_ERROR', 'The account service could not be reached.')
      } finally {
        clearTimeout(timeout)
      }
    }

    let response = await attempt(false)
    if (response.status === 401) response = await attempt(true)
    if (response.ok) return response

    const body = await limitedJson(response.clone())
    if (response.status === 403 && isReverificationHint(body)) return response
    throw new AccountRequestError(response.status, errorCode(body), safeMessage(response.status))
  }

  return { request: send }
}

const deviceSummarySchema = z.strictObject({
  deviceId: z.string().uuid(),
  name: z.string().trim().min(1).max(100),
  platform: z.enum(['web', 'desktop']),
  appVersion: z.string().trim().min(1).max(40),
  createdAt: z.string().datetime({ offset: true }),
  lastSeenAt: z.string().datetime({ offset: true }),
  revokedAt: z.string().datetime({ offset: true }).nullable().optional(),
  isCurrentDevice: z.boolean(),
})

export function parseDeviceSummaries(value: unknown): DeviceSummary[] {
  try {
    return z.array(deviceSummarySchema).max(1_000).parse(value)
  } catch {
    throw new AccountRequestError(502, 'INVALID_RESPONSE', 'The account service returned an invalid device list.')
  }
}

export function parseAccountExportBundle(value: unknown): AccountExportBundle {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new AccountRequestError(502, 'INVALID_RESPONSE', 'The account service returned an invalid export.')
  }
  const source = value as Record<string, unknown>
  if (Object.keys(source).some((key) => !['version', 'exportedAt', 'ownerId', 'collections'].includes(key)) ||
      source.version !== 1 || typeof source.ownerId !== 'string' || source.ownerId.length < 1 || source.ownerId.length > 255 ||
      typeof source.exportedAt !== 'string' || Number.isNaN(Date.parse(source.exportedAt)) ||
      !source.collections || typeof source.collections !== 'object' || Array.isArray(source.collections)) {
    throw new AccountRequestError(502, 'INVALID_RESPONSE', 'The account service returned an invalid export.')
  }
  const collectionSource = source.collections as Record<string, unknown>
  if (Object.keys(collectionSource).length !== TEND_COLLECTIONS.length ||
      Object.keys(collectionSource).some((key) => !TEND_COLLECTIONS.includes(key as (typeof TEND_COLLECTIONS)[number]))) {
    throw new AccountRequestError(502, 'INVALID_RESPONSE', 'The account service returned an invalid export.')
  }

  let total = 0
  const collections = Object.fromEntries(TEND_COLLECTIONS.map((collection) => {
    const records = collectionSource[collection]
    if (!Array.isArray(records)) {
      throw new AccountRequestError(502, 'INVALID_RESPONSE', 'The account service returned an invalid export.')
    }
    total += records.length
    if (total > MAX_EXPORT_RECORDS) {
      throw new AccountRequestError(502, 'INVALID_RESPONSE', 'The account service returned an invalid export.')
    }
    const parsed = records.map((record) => {
      if (!record || typeof record !== 'object' || Array.isArray(record)) throw new Error('invalid')
      const candidate = record as Record<string, unknown>
      if (Object.keys(candidate).some((key) => !['recordId', 'revision', 'data', 'modifiedAt'].includes(key))) {
        throw new Error('invalid')
      }
      const remote = parseRemoteRecord({
        collection,
        recordId: candidate.recordId,
        revision: candidate.revision,
        data: candidate.data,
        modifiedAt: candidate.modifiedAt,
        deletedAt: null,
      })
      return {
        recordId: remote.recordId,
        revision: remote.revision,
        data: remote.data as Record<string, unknown>,
        modifiedAt: remote.modifiedAt,
      }
    })
    return [collection, parsed]
  })) as AccountExportBundle['collections']

  return {
    version: 1,
    exportedAt: source.exportedAt,
    ownerId: source.ownerId,
    collections,
  }
}
