const encoder = new TextEncoder()

/**
 * 32-bit FNV-1a over UTF-8 bytes. Offset basis 2166136261, prime 16777619.
 * Returns the UNSIGNED value (0 … 2^32 − 1). Using the signed value is a bug (see PLAN.md §5.2).
 */
export function fnv1a32(s: string): number {
  let h = 2166136261
  for (const b of encoder.encode(s)) {
    h ^= b
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}
