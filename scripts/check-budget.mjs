// Build-output budget check (PLAN.md §3/§8): initial JS ≤ 100 KB gzipped, fonts ≤ 150 KB.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

const dist = new URL('../dist/', import.meta.url).pathname
const assets = join(dist, 'assets')
const JS_BUDGET = 100 * 1024
const FONT_BUDGET = 150 * 1024

const html = readFileSync(join(dist, 'index.html'), 'utf8')
const initialJs = [...html.matchAll(/<script[^>]+src="\/assets\/([^"]+\.js)"/g), ...html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="\/assets\/([^"]+\.js)"/g)].map((m) => m[1])

let jsGz = 0
for (const f of new Set(initialJs)) jsGz += gzipSync(readFileSync(join(assets, f))).length

let fonts = 0
const fontFiles = []
for (const f of readdirSync(assets)) {
  if (f.endsWith('.woff2') || f.endsWith('.woff') || f.endsWith('.ttf')) {
    fonts += statSync(join(assets, f)).size
    fontFiles.push(f)
  }
}

const kb = (n) => `${(n / 1024).toFixed(1)} KB`
console.log(`[budget] initial JS (gzip): ${kb(jsGz)} / ${kb(JS_BUDGET)}`)
console.log(`[budget] fonts: ${kb(fonts)} / ${kb(FONT_BUDGET)} (${fontFiles.length} files)`)
let ok = true
if (jsGz > JS_BUDGET) {
  console.error('[budget] FAIL: initial JS over budget')
  ok = false
}
if (fonts > FONT_BUDGET) {
  console.error('[budget] FAIL: fonts over budget')
  ok = false
}
process.exit(ok ? 0 : 1)
