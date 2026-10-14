const EVENT_CODE_PATTERN = /^[A-Z][A-Z0-9_]{0,63}$/
const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/
const PSEUDONYM_PATTERN = /^hmac-sha256:[a-f0-9]{32}$/

export type SecurityEvent = {
  eventCode: string
  requestId: string
  principalRef: string
  networkRef: string
  deviceRef: string
}

export type SecurityEventLogger = (entry: SecurityEvent) => void

function safeValue(value: string, pattern: RegExp): string {
  return pattern.test(value) ? value : 'redacted'
}

/**
 * Emits a deliberately closed event shape. Raw owners, addresses, devices,
 * request bodies, headers, errors, and provider responses are never accepted.
 */
export function recordSecurityEvent(
  event: SecurityEvent,
  logger: SecurityEventLogger = (entry) => console.warn(JSON.stringify(entry)),
): void {
  logger({
    eventCode: safeValue(event.eventCode, EVENT_CODE_PATTERN),
    requestId: safeValue(event.requestId, REQUEST_ID_PATTERN),
    principalRef: safeValue(event.principalRef, PSEUDONYM_PATTERN),
    networkRef: safeValue(event.networkRef, PSEUDONYM_PATTERN),
    deviceRef: safeValue(event.deviceRef, PSEUDONYM_PATTERN),
  })
}
