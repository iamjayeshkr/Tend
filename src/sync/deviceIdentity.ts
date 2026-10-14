import { uid } from '../core'

const DEVICE_ID_KEY = 'tend.sync.device-id.v1'
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
let memoryDeviceId: string | null = null

export function deviceIdFor(storage?: Pick<Storage, 'getItem' | 'setItem'> | null): string {
  if (memoryDeviceId) return memoryDeviceId
  let persistentStorage = storage
  if (persistentStorage === undefined) {
    try { persistentStorage = globalThis.localStorage } catch { persistentStorage = null }
  }
  try {
    const stored = persistentStorage?.getItem(DEVICE_ID_KEY)
    if (stored && UUID_PATTERN.test(stored)) {
      memoryDeviceId = stored
      return stored
    }
  } catch {
    // Storage can be denied by privacy settings; the in-memory id still keeps this session stable.
  }

  const created = uid()
  memoryDeviceId = created
  try { persistentStorage?.setItem(DEVICE_ID_KEY, created) } catch {
    // The caller can still sync for this open session without persistent web storage.
  }
  return created
}

export function resetDeviceIdentityForTests(): void {
  memoryDeviceId = null
}
