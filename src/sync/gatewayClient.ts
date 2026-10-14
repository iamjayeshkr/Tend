import {
  parseApiError,
  parseDeviceRegistration,
  parsePullRequest,
  parsePullResponse,
  parsePushRequest,
  parsePushResponse,
  parseValidateMigrationRequest,
  parseValidateMigrationResponse,
} from './schemas'
import type {
  DeviceRegistration,
  PullRequest,
  PullResponse,
  PushRequest,
  PushResponse,
  ValidateMigrationRequest,
  ValidateMigrationResponse,
} from './types'

const MAX_RESPONSE_BYTES = 2_097_152

export type GatewayRequestOptions = { signal?: AbortSignal }

export type AccessTokenSupplier = (options?: { forceRefresh?: boolean }) => Promise<string | null>

export type GatewayClientOptions = {
  baseUrl: string
  getAccessToken: AccessTokenSupplier
  fetch?: typeof fetch
  timeoutMs?: number
  requestId?: () => string
  now?: () => number
  setTimer?: (callback: () => void, delayMs: number) => unknown
  clearTimer?: (timer: unknown) => void
}

type GatewayErrorOptions = {
  status?: number
  code: string
  retryable: boolean
  retryAfterSeconds?: number
  requestId?: string
  message?: string
}

export class GatewayError extends Error {
  readonly status?: number
  readonly code: string
  readonly retryable: boolean
  readonly retryAfterSeconds?: number
  readonly requestId?: string

  constructor(options: GatewayErrorOptions) {
    super(options.message ?? safeMessage(options.status, options.code))
    this.name = 'GatewayError'
    this.status = options.status
    this.code = options.code
    this.retryable = options.retryable
    this.retryAfterSeconds = options.retryAfterSeconds
    this.requestId = options.requestId
  }
}

export interface SyncGateway {
  registerDevice(registration: DeviceRegistration, options?: GatewayRequestOptions): Promise<{ status: 'registered' | 'active' }>
  validateMigration(request: ValidateMigrationRequest, options?: GatewayRequestOptions): Promise<ValidateMigrationResponse>
  push(request: PushRequest, options?: GatewayRequestOptions): Promise<PushResponse>
  pull(request: PullRequest, options?: GatewayRequestOptions): Promise<PullResponse>
}

function safeMessage(status: number | undefined, code: string): string {
  if (code === 'TIMEOUT') return 'Synchronization timed out. It will be safe to try again.'
  if (code === 'CANCELLED') return 'Synchronization was cancelled.'
  if (status === 401 || code === 'AUTH_REQUIRED') return 'Please sign in again to continue synchronizing.'
  if (status === 403) return 'This account or device is not allowed to synchronize.'
  if (status === 409) return 'This synchronization operation is already being processed.'
  if (status === 410) return 'The local sync cursor is too old and needs a safe refresh.'
  if (status === 413) return 'The synchronization request is too large.'
  if (status === 422) return 'Some local data could not be accepted for synchronization.'
  if (status === 429) return 'Synchronization is temporarily rate limited.'
  if (status !== undefined && status >= 500) return 'Synchronization is temporarily unavailable.'
  if (code === 'INVALID_RESPONSE') return 'The synchronization service returned an invalid response.'
  if (code === 'NETWORK_ERROR') return 'The synchronization service could not be reached.'
  return 'Synchronization could not be completed.'
}

function retryableStatus(status: number): boolean {
  return status === 409 || status === 429 || status >= 500
}

function parsedRetryAfter(response: Response, now: number): number | undefined {
  const value = response.headers.get('retry-after')
  if (!value) return undefined
  const seconds = Number(value)
  if (Number.isInteger(seconds) && seconds >= 0) return Math.min(seconds, 86_400)
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return undefined
  return Math.min(86_400, Math.max(0, Math.ceil((timestamp - now) / 1_000)))
}

async function responseJson(response: Response): Promise<unknown> {
  const declaredLength = Number(response.headers.get('content-length') ?? '0')
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    throw new GatewayError({ status: 502, code: 'INVALID_RESPONSE', retryable: true })
  }
  const text = await response.text()
  if (new TextEncoder().encode(text).byteLength > MAX_RESPONSE_BYTES) {
    throw new GatewayError({ status: 502, code: 'INVALID_RESPONSE', retryable: true })
  }
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new GatewayError({ status: 502, code: 'INVALID_RESPONSE', retryable: true })
  }
}

function parsedBaseUrl(value: string): string {
  const url = new URL(value)
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) || url.username || url.password || url.search || url.hash) {
    throw new Error('Sync gateway URL must be an HTTPS origin/path without credentials, query, or fragment.')
  }
  return url.toString().replace(/\/$/, '')
}

function defaultSetTimer(callback: () => void, delayMs: number): unknown {
  return globalThis.setTimeout(callback, delayMs)
}

function defaultClearTimer(timer: unknown): void {
  globalThis.clearTimeout(timer as ReturnType<typeof setTimeout>)
}

export function createSyncGateway(options: GatewayClientOptions): SyncGateway {
  const baseUrl = parsedBaseUrl(options.baseUrl)
  const fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis)
  const timeoutMs = options.timeoutMs ?? 15_000
  const requestId = options.requestId ?? (() => crypto.randomUUID())
  const now = options.now ?? Date.now
  const setTimer = options.setTimer ?? defaultSetTimer
  const clearTimer = options.clearTimer ?? defaultClearTimer
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000) {
    throw new Error('Sync gateway timeout is invalid.')
  }

  async function perform(
    path: string,
    init: Omit<RequestInit, 'headers' | 'signal'> & { headers?: HeadersInit },
    requestOptions: GatewayRequestOptions,
  ): Promise<unknown> {
    const correlationId = requestId()
    let forceRefresh = false

    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (requestOptions.signal?.aborted) {
        throw new GatewayError({ code: 'CANCELLED', retryable: false })
      }
      let token: string | null
      try {
        token = await options.getAccessToken({ forceRefresh })
      } catch {
        throw new GatewayError({
          status: forceRefresh ? 401 : undefined,
          code: forceRefresh ? 'AUTH_REQUIRED' : 'AUTH_UNAVAILABLE',
          retryable: !forceRefresh,
        })
      }
      if (!token) throw new GatewayError({ status: 401, code: 'AUTH_REQUIRED', retryable: false })

      const controller = new AbortController()
      let timedOut = false
      let cancelled = false
      const cancel = () => { cancelled = true; controller.abort() }
      requestOptions.signal?.addEventListener('abort', cancel, { once: true })
      const timer = setTimer(() => { timedOut = true; controller.abort() }, timeoutMs)

      let response: Response
      try {
        const headers = new Headers(init.headers)
        headers.set('authorization', `Bearer ${token}`)
        headers.set('x-request-id', correlationId)
        response = await fetchImpl(`${baseUrl}${path}`, { ...init, headers, signal: controller.signal })
      } catch (error) {
        if (timedOut) throw new GatewayError({ code: 'TIMEOUT', retryable: true })
        if (cancelled || requestOptions.signal?.aborted) {
          throw new GatewayError({ code: 'CANCELLED', retryable: false })
        }
        if (error instanceof GatewayError) throw error
        throw new GatewayError({ code: 'NETWORK_ERROR', retryable: true })
      } finally {
        clearTimer(timer)
        requestOptions.signal?.removeEventListener('abort', cancel)
      }

      if (response.status === 401 && attempt === 0) {
        forceRefresh = true
        continue
      }
      if (response.ok) return responseJson(response)

      let code = response.status >= 500 ? 'SERVER_ERROR' : `HTTP_${response.status}`
      let serverRequestId: string | undefined
      let bodyRetryAfter: number | undefined
      try {
        const envelope = await responseJson(response)
        if (envelope && typeof envelope === 'object' && !Array.isArray(envelope)) {
          const error = parseApiError((envelope as { error?: unknown }).error)
          code = error.code
          serverRequestId = error.requestId
          bodyRetryAfter = error.retryAfterSeconds
        }
      } catch {
        // The HTTP status still maps to a safe generic failure.
      }
      if (response.status === 401) code = 'AUTH_REQUIRED'
      const retryAfterSeconds = parsedRetryAfter(response, now()) ?? bodyRetryAfter
      throw new GatewayError({
        status: response.status,
        code,
        retryable: retryableStatus(response.status),
        ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
        ...(serverRequestId === undefined ? {} : { requestId: serverRequestId }),
      })
    }

    throw new GatewayError({ status: 401, code: 'AUTH_REQUIRED', retryable: false })
  }

  async function post(path: string, body: unknown, requestOptions: GatewayRequestOptions): Promise<unknown> {
    return perform(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }, requestOptions)
  }

  return {
    async registerDevice(registration, requestOptions = {}) {
      const request = parseDeviceRegistration(registration)
      const response = await post('/device/register', request, requestOptions)
      if (
        !response || typeof response !== 'object' || Array.isArray(response)
        || Object.keys(response).join(',') !== 'status'
        || !['registered', 'active'].includes(String((response as { status?: unknown }).status))
      ) {
        throw new GatewayError({ status: 502, code: 'INVALID_RESPONSE', retryable: true })
      }
      return response as { status: 'registered' | 'active' }
    },

    async validateMigration(value, requestOptions = {}) {
      const request = parseValidateMigrationRequest(value)
      const response = await post('/migration/validate', request, requestOptions)
      try {
        return parseValidateMigrationResponse(response)
      } catch {
        throw new GatewayError({ status: 502, code: 'INVALID_RESPONSE', retryable: true })
      }
    },

    async push(value, requestOptions = {}) {
      const request = parsePushRequest(value)
      const response = await post('/push', request, requestOptions)
      try {
        return parsePushResponse(response)
      } catch {
        throw new GatewayError({ status: 502, code: 'INVALID_RESPONSE', retryable: true })
      }
    },

    async pull(value, requestOptions = {}) {
      const request = parsePullRequest(value)
      const query = new URLSearchParams({ deviceId: request.deviceId, limit: String(request.limit) })
      if (request.cursor !== undefined) query.set('cursor', request.cursor)
      const response = await perform(`/pull?${query.toString()}`, { method: 'GET' }, requestOptions)
      try {
        return parsePullResponse(response)
      } catch {
        throw new GatewayError({ status: 502, code: 'INVALID_RESPONSE', retryable: true })
      }
    },
  }
}
