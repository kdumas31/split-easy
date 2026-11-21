// Monotonic stamps (PLAN.md §4): stamp() = lastStamp = max(Date.now(), lastStamp + 1).
// Used only by local user actions, never inside mergeGroup.

let lastStamp = 0
const listeners = new Set<() => void>()

export function stamp(): number {
  lastStamp = Math.max(Date.now(), lastStamp + 1)
  for (const l of listeners) l()
  return lastStamp
}

export function getLastStamp(): number {
  return lastStamp
}

/** After load or import: lastStamp = max(lastStamp, seen). */
export function observeStamp(seen: number): void {
  if (Number.isFinite(seen) && seen > lastStamp) lastStamp = seen
}

/** Notified whenever a local edit stamps (used to expire Undo). */
export function onStamp(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** Test helper. */
export function resetClock(value = 0): void {
  lastStamp = value
}
