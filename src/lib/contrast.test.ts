import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Parses src/styles/tokens.css and checks every text/background pair with the WCAG 2.x formula.
const css = readFileSync(new URL('../styles/tokens.css', import.meta.url), 'utf8')

function block(selector: string): Record<string, string> {
  const start = css.indexOf(selector)
  if (start < 0) throw new Error(`missing ${selector}`)
  const open = css.indexOf('{', start)
  const close = css.indexOf('}', open)
  const out: Record<string, string> = {}
  for (const m of css.slice(open + 1, close).matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)) out[m[1] as string] = (m[2] as string).toLowerCase()
  return out
}

function lum(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * (c[0] as number) + 0.7152 * (c[1] as number) + 0.0722 * (c[2] as number)
}

export function ratio(a: string, b: string): number {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p) as [number, number]
  return (x + 0.05) / (y + 0.05)
}

const themes = {
  light: block(":root[data-theme='light']"),
  dark: block(":root[data-theme='dark'] {"),
}

// [foreground, background]
const TEXT_PAIRS: Array<[string, string]> = [
  ['ink', 'paper'],
  ['ink', 'surface'],
  ['ink-muted', 'paper'],
  ['ink-muted', 'surface'],
  ['primary', 'paper'],
  ['primary', 'surface'],
  ['on-primary', 'primary'],
  ['on-accent', 'accent'],
  ['gets-back', 'paper'],
  ['gets-back', 'surface'],
  ['owes', 'paper'],
  ['owes', 'surface'],
  ['ink', 'primary-soft'],
  ['ink-muted', 'primary-soft'],
  ['primary', 'primary-soft'],
  ['paper', 'ink'], // toast
  ['toast-action', 'ink'], // toast action
]
const UI_PAIRS: Array<[string, string]> = [
  ['focus', 'paper'],
  ['focus', 'surface'],
]

describe('palette contrast (WCAG)', () => {
  it('formula sanity', () => {
    expect(ratio('#000000', '#ffffff')).toBeCloseTo(21, 5)
  })
  for (const [name, t] of Object.entries(themes)) {
    it.each(TEXT_PAIRS)(`${name}: %s on %s ≥ 4.5:1`, (fg, bg) => {
      expect(t[fg], fg).toBeDefined()
      expect(t[bg], bg).toBeDefined()
      expect(ratio(t[fg] as string, t[bg] as string)).toBeGreaterThanOrEqual(4.5)
    })
    it.each(UI_PAIRS)(`${name}: %s on %s ≥ 3:1`, (fg, bg) => {
      expect(ratio(t[fg] as string, t[bg] as string)).toBeGreaterThanOrEqual(3)
    })
  }
  it('dark block under prefers-color-scheme matches the explicit dark block', () => {
    expect(block("@media (prefers-color-scheme: dark)")).toEqual(themes.dark)
  })
})
