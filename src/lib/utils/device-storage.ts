/**
 * This device's `localStorage`, or null where there is none to be had: on the server, and in a
 * browser that refuses it (blocked site data, some private windows), where even reading
 * `window.localStorage` throws. Callers still wrap `getItem`/`setItem` — a full or locked store
 * throws there too — and treat the device as a convenience, never as the record.
 */
export function deviceStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}
