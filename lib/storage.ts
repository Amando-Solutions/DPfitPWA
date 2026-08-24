// =============================================================================
// A small, SSR-safe, versioned wrapper around Web Storage.
//
// Nothing else in the app touches `localStorage` directly. Everything goes
// through here, so the browser-only concerns (no `window` on the server, quota
// errors, JSON parsing, schema versioning) live in exactly one place.
// =============================================================================

const NAMESPACE = 'dpfit'

/** Bump when a persisted shape changes incompatibly; older data is discarded. */
export const SCHEMA_VERSION = 1

const VERSION_KEY = `${NAMESPACE}:schema-version`

type Listener = () => void
const listeners = new Set<Listener>()

/**
 * Whether Web Storage can be written to.
 *
 * The probe is a real `setItem`/`removeItem` round-trip, which is synchronous
 * and, on some engines, hits disk. Every `read` and `write` used to run one,
 * so a screen that reads a dozen keys paid a dozen probes. The answer cannot
 * change within a session (a tab does not leave private browsing), so it is
 * resolved once and cached.
 *
 * Quota is deliberately *not* part of this: a full store still reports as
 * available and `write` catches the failure, which is the only place the
 * distinction matters.
 */
let availability: boolean | null = null

const available = (): boolean => {
  if (import.meta.server) return false
  if (availability !== null) return availability
  try {
    const probe = `${NAMESPACE}:probe`
    window.localStorage.setItem(probe, '1')
    window.localStorage.removeItem(probe)
    availability = true
  } catch {
    // Private browsing, disabled storage, or over quota.
    availability = false
  }
  return availability
}

/**
 * In-memory stand-in used on the server and whenever Web Storage is blocked.
 * The app stays fully functional for the session, it just doesn't survive a
 * reload, which is the correct degradation for a PWA.
 */
const memory = new Map<string, string>()

/**
 * Keys whose last write could not be persisted.
 *
 * Web Storage is available right up until it is full, so a quota failure used
 * to leave the two stores disagreeing: the value went to `memory`, but `read`
 * still went to `localStorage` and handed back the *previous* value. A chat
 * message sent against a full store came back missing on the next read, with
 * nothing anywhere to say why. Reads for these keys come from `memory` until a
 * write succeeds again.
 */
const overflowed = new Set<string>()

let checkedVersion = false

const ensureVersion = () => {
  if (checkedVersion || !available()) return
  checkedVersion = true
  const stored = window.localStorage.getItem(VERSION_KEY)
  if (stored !== String(SCHEMA_VERSION)) {
    // Drop everything under our namespace: a partial migration is worse than
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
    const full = fullKey(key)
    const raw =
      available() && !overflowed.has(full)
        ? window.localStorage.getItem(full)
        : (memory.get(full) ?? null)
    if (raw === null) return fallback
    try {
      return JSON.parse(raw) as T
    } catch {
      return fallback
    }
  },

  /**
   * Returns whether the value made it to disk. Callers that can tell the
   * member something useful about a full store check it; the rest ignore it,
   * because the value is still readable for the rest of the session either way.
   */
  write<T>(key: string, value: T): boolean {
    ensureVersion()
    const full = fullKey(key)
    const raw = JSON.stringify(value)
    let persisted = false

    if (available()) {
      try {
        window.localStorage.setItem(full, raw)
        overflowed.delete(full)
        memory.delete(full)
        persisted = true
      } catch (error) {
        // Out of quota, most likely photos. Keep the app alive rather than
        // throwing out of a click handler, and keep reads consistent by
        // serving this key from memory from here on.
        console.warn(`[storage] could not persist "${key}"`, error)
        overflowed.add(full)
        memory.set(full, raw)
      }
    } else {
      memory.set(full, raw)
    }

    listeners.forEach((fn) => fn())
    return persisted
  },

  /**
   * Whether anything written this session is being held in memory only.
   *
   * True once a write has hit the quota. What it means for the member is that
   * their newest photos and messages are readable now but will not survive a
   * reload, which is worth saying out loud.
   */
  hasOverflow(): boolean {
    return overflowed.size > 0
  },

  remove(key: string): void {
    if (available()) window.localStorage.removeItem(fullKey(key))
    memory.delete(fullKey(key))
    overflowed.delete(fullKey(key))
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
    overflowed.clear()
    listeners.forEach((fn) => fn())
  },

  /** Notified after any write, to keep multiple tabs roughly in sync. */
  subscribe(fn: Listener): () => void {
    listeners.add(fn)
    return () => listeners.delete(fn)
  },
}
