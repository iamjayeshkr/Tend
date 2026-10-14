import { beforeEach, describe, expect, it, vi } from 'vitest'

import { deviceIdFor, resetDeviceIdentityForTests } from './deviceIdentity'

describe('deviceIdFor', () => {
  beforeEach(() => resetDeviceIdentityForTests())

  it('creates one anonymous installation id and reuses it without hardware identifiers', () => {
    const values = new Map<string, string>()
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value) },
    }
    const first = deviceIdFor(storage as Storage)
    resetDeviceIdentityForTests()
    expect(deviceIdFor(storage as Storage)).toBe(first)
    expect(first).toMatch(/^[0-9a-f-]{36}$/i)
    expect(JSON.stringify([...values])).not.toMatch(/hardware|advertising|fingerprint/i)
  })

  it('continues with a session id when persistent storage is unavailable', () => {
    const storage = {
      getItem: vi.fn(() => { throw new Error('denied') }),
      setItem: vi.fn(() => { throw new Error('denied') }),
    }
    expect(() => deviceIdFor(storage as unknown as Storage)).not.toThrow()
    expect(deviceIdFor(storage as unknown as Storage)).toMatch(/^[0-9a-f-]{36}$/i)
  })
})
