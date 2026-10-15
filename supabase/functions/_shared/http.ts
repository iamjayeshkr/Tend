const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/
const ALLOWED_METHODS = new Set(['GET', 'POST', 'DELETE'])
const ALLOWED_REQUEST_HEADERS = new Set(['authorization', 'content-type', 'x-device-id', 'x-request-id'])

export class ApiFailure extends Error {
  readonly status: number
  readonly code: string
  readonly headers?: HeadersInit

  constructor(status: number, code: string, message: string, headers?: HeadersInit) {
    super(message)
    this.name = 'ApiFailure'
    this.status = status
    this.code = code
    this.headers = headers
  }
}

export function requestIdFor(request: Request): string {
  const candidate = request.headers.get('x-request-id')
  return candidate && REQUEST_ID_PATTERN.test(candidate)
    ? candidate
    : crypto.randomUUID()
}

function approvedOrigin(origin: string | null | undefined, allowedOrigins: readonly string[]): string | null {
  return origin && allowedOrigins.includes(origin) ? origin : null
}

function hardeningHeaders(requestId: string): Headers {
  return new Headers({
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
    'x-request-id': requestId,
  })
}

function applyCors(headers: Headers, origin: string | null | undefined, allowedOrigins: readonly string[]): void {
  const allowedOrigin = approvedOrigin(origin, allowedOrigins)
  if (!allowedOrigin) return

  headers.set('access-control-allow-origin', allowedOrigin)
  headers.append('vary', 'Origin')
}

export function handlePreflight(request: Request, allowedOrigins: readonly string[]): Response | null {
  if (request.method !== 'OPTIONS') return null

  const origin = request.headers.get('origin')
  const allowedOrigin = approvedOrigin(origin, allowedOrigins)
  if (!allowedOrigin) {
    throw new ApiFailure(403, 'ORIGIN_DENIED', 'Request origin is not allowed.')
  }

  const requestedMethod = request.headers.get('access-control-request-method')?.toUpperCase()
  if (!requestedMethod || !ALLOWED_METHODS.has(requestedMethod)) {
    throw new ApiFailure(403, 'METHOD_DENIED', 'Requested method is not allowed.')
  }

  const requestedHeaders = (request.headers.get('access-control-request-headers') ?? '')
    .split(',')
    .map((header) => header.trim().toLowerCase())
    .filter(Boolean)
  if (requestedHeaders.some((header) => !ALLOWED_REQUEST_HEADERS.has(header))) {
    throw new ApiFailure(403, 'HEADER_DENIED', 'Requested headers are not allowed.')
  }

  const headers = new Headers({
    'access-control-allow-origin': allowedOrigin,
    'access-control-allow-methods': requestedMethod,
    'access-control-max-age': '600',
    'cache-control': 'no-store',
    vary: 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers',
    'x-content-type-options': 'nosniff',
  })
  if (requestedHeaders.length > 0) {
    headers.set('access-control-allow-headers', requestedHeaders.join(', '))
  }

  return new Response(null, { status: 204, headers })
}

export type JsonResponseOptions = {
  status?: number
  requestId: string
  origin?: string | null
  allowedOrigins?: readonly string[]
  headers?: HeadersInit
}

export function jsonResponse(body: unknown, options: JsonResponseOptions): Response {
  const headers = hardeningHeaders(options.requestId)
  if (options.headers) {
    new Headers(options.headers).forEach((value, name) => headers.set(name, value))
  }
  applyCors(headers, options.origin, options.allowedOrigins ?? [])

  return new Response(JSON.stringify(body), {
    status: options.status ?? 200,
    headers,
  })
}

export async function readJsonBody(request: Request, maxBytes: number): Promise<unknown> {
  const rawLength = request.headers.get('content-length')
  if (rawLength !== null) {
    const contentLength = Number(rawLength)
    if (!Number.isSafeInteger(contentLength) || contentLength < 0) {
      throw new ApiFailure(400, 'INVALID_CONTENT_LENGTH', 'Content length is invalid.')
    }
    if (contentLength > maxBytes) {
      throw new ApiFailure(413, 'BODY_TOO_LARGE', 'Request body is too large.')
    }
  }

  const contentType = request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase()
  if (contentType !== 'application/json') {
    throw new ApiFailure(415, 'CONTENT_TYPE_REQUIRED', 'Content-Type must be application/json.')
  }

  const bytes = new Uint8Array(await request.arrayBuffer())
  if (bytes.byteLength > maxBytes) {
    throw new ApiFailure(413, 'BODY_TOO_LARGE', 'Request body is too large.')
  }

  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown
  } catch {
    throw new ApiFailure(400, 'INVALID_JSON', 'Request body must contain valid JSON.')
  }
}

type SafeLogger = (entry: {
  level: 'error'
  requestId: string
  status: number
  code: string
  errorName: string
}) => void

export type ErrorResponseOptions = {
  request: Request
  allowedOrigins: readonly string[]
  logger?: SafeLogger
}

export function errorResponse(error: unknown, options: ErrorResponseOptions): Response {
  const requestId = requestIdFor(options.request)
  const failure = error instanceof ApiFailure
    ? error
    : new ApiFailure(500, 'INTERNAL_ERROR', 'The request could not be completed.')

  options.logger?.({
    level: 'error',
    requestId,
    status: failure.status,
    code: failure.code,
    errorName: error instanceof Error ? error.name : 'UnknownError',
  })

  return jsonResponse({
    error: {
      code: failure.code,
      message: failure.message,
      requestId,
    },
  }, {
    status: failure.status,
    requestId,
    origin: options.request.headers.get('origin'),
    allowedOrigins: options.allowedOrigins,
    headers: failure.headers,
  })
}
