const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'

/** 12-char base62 id from crypto.getRandomValues (~71 bits). Rejection sampling avoids modulo bias. */
export function newId(): string {
  let out = ''
  const buf = new Uint8Array(24)
  while (out.length < 12) {
    crypto.getRandomValues(buf)
    for (const b of buf) {
      if (b < 248) out += ALPHABET[b % 62]
      if (out.length === 12) break
    }
  }
  return out
}

// Must start with a letter/digit, so "__proto__" can never be an id (ids become object keys).
export const ID_RE = /^[0-9A-Za-z][0-9A-Za-z_]{0,31}$/
