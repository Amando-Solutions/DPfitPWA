// =============================================================================
// A small, SSR-safe, versioned wrapper around Web Storage.
//
// Nothing else in the app touches `localStorage` directly — everything goes
// through here, so the browser-only concerns (no `window` on the server, quota
// errors, JSON parsing, schema versioning) live in exactly one place.
// =============================================================================

const NAMESPACE = 'dpfit'

/** Bump when a persisted shape changes incompatibly; older data is discarded. */
export const SCHEMA_VERSION = 1

const VERSION_KEY = `${NAMESPACE}:schema-version`

type Listener = () => void
const listeners = new Set<Listener>()

const available = (): boolean => {
  if (import.meta.server) return false
  try {
    const probe = `${NAMESPACE}:probe`
    window.localStorage.setItem(probe, '1')
    window.localStorage.removeItem(probe)
    return true
  } catch {
    // Private browsing, disabled storage, or over quota.
    return false
  }
}

/**
 * In-memory stand-in used on the server and whenever Web Storage is blocked.
 * The app stays fully functional for the session, it just doesn't survive a
 * reload — which is the correct degradation for a PWA.
 */
const memory = new Map<string, string>()

let checkedVersion = false

const ensureVersion = () => {
  if (checkedVersion || !available()) return
  checkedVersion = true
  const stored = window.localStorage.getItem(VERSION_KEY)
  if (stored !== String(SCHEMA_VERSION)) {
    // Drop everything under our namespace — a partial migration is worse than
    // a clean start while the schema is still moving.
    const doomed: string[] = []
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i)
      if (key?.startsWith(`${NAMESPACE}:`)) doomed.push(key)
    }
    doomed.forEach((key) => window.localStorage.removeItem(key))
    window.localStorage.setItem(VERSION_KEY, String(SCHEMA_VERSION))
  }
}

const fullKey = (key: string) => `${NAMESPACE}:${key}`

export const storage = {
  read<T>(key: string, fallback: T): T {
    ensureVersion()
    const raw = available()
      ? window.localStorage.getItem(fullKey(key))
      : (memory.get(fullKey(key)) ?? null)
    if (raw === null) return fallback
    try {
      return JSON.parse(raw) as T
    } catch {
      return fallback
    }
  },

  write<T>(key: string, value: T): void {
    ensureVersion()
    const raw = JSON.stringify(value)
    if (available()) {
      try {
        window.localStorage.setItem(fullKey(key), raw)
      } catch (error) {
        // Quota exceeded — most likely progress photos. Keep the app alive and
        // surface it rather than throwing out of a click handler.
        console.warn(`[storage] could not persist "${key}"`, error)
        memory.set(fullKey(key), raw)
      }
    } else {
      memory.set(fullKey(key), raw)
    }
    listeners.forEach((fn) => fn())
  },

  remove(key: string): void {
    if (available()) window.localStorage.removeItem(fullKey(key))
    memory.delete(fullKey(key))
    listeners.forEach((fn) => fn())
  },

  /** Wipe every key this app owns (sign out / reset). */
  clear(): void {
    if (available()) {
      const doomed: string[] = []
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i)
        if (key?.startsWith(`${NAMESPACE}:`) && key !== VERSION_KEY) doomed.push(key)
      }
      doomed.forEach((key) => window.localStorage.removeItem(key))
    }
    memory.clear()
    listeners.forEach((fn) => fn())
  },

  /** Notified after any write — used to keep multiple tabs roughly in sync. */
  subscribe(fn: Listener): () => void {
    listeners.add(fn)
    return () => listeners.delete(fn)
  },
}
