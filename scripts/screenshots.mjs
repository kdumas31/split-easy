// Takes README screenshots and checks offline reload. Run after `npm run build`:
//   node scripts/screenshots.mjs [outDir]
// Starts `vite preview` on 8840 (strictPort), drives headless Chromium, then stops the server.
import { chromium } from '@playwright/test'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'

const out = process.argv[2] ?? 'docs/screenshots'
mkdirSync(out, { recursive: true })
const URL = 'http://localhost:8840'

const server = spawn('npx', ['vite', 'preview', '--port', '8840', '--strictPort', '--host', 'localhost'], { stdio: ['ignore', 'pipe', 'inherit'] })
const stop = () => server.kill('SIGTERM')
process.on('exit', stop)

async function waitUp() {
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(URL)
      if (r.ok) return
    } catch {}
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error('preview server did not start (is 8840 busy?)')
}

try {
  await waitUp()
  const browser = await chromium.launch()
  const shot = async (page, name) => {
    await page.waitForTimeout(250)
    await page.screenshot({ path: `${out}/${name}.png`, fullPage: true })
    console.log('saved', name)
  }

  for (const [theme, width] of [
    ['light', 360],
    ['dark', 360],
    ['light', 768],
    ['dark', 1280],
  ]) {
    const ctx = await browser.newContext({ viewport: { width, height: 800 }, colorScheme: theme, deviceScaleFactor: 2 })
    const page = await ctx.newPage()
    await page.goto(URL)
    await shot(page, `home-empty-${theme}-${width}`)
    await page.getByRole('button', { name: 'Try the demo trip' }).click()
    await page.getByRole('heading', { level: 1, name: 'Lakehouse Weekend' }).waitFor()
    await shot(page, `group-${theme}-${width}`)
    await page.getByRole('link', { name: 'Settle up' }).first().click()
    await page.getByRole('heading', { level: 1, name: 'Settle up' }).waitFor()
    await shot(page, `settle-${theme}-${width}`)
    await page.getByRole('link', { name: 'Expenses' }).click()
    await page.getByRole('link', { name: /Kayak rental/ }).click()
    await page.getByRole('heading', { level: 1, name: 'Edit expense' }).waitFor()
    await shot(page, `editor-${theme}-${width}`)
    if (width === 768) {
      await page.goBack()
      await page.getByRole('link', { name: 'Print' }).click()
      await page.getByRole('heading', { level: 1, name: 'Summary' }).waitFor()
      await page.emulateMedia({ media: 'print' })
      await shot(page, `print-preview`)
      await page.emulateMedia({ media: 'screen' })
      await page.getByRole('link', { name: 'Share' }).click()
      await page.getByRole('heading', { level: 1, name: 'Share' }).waitFor()
      await shot(page, `share-${theme}-${width}`)
      await page.goto(URL)
      await shot(page, `home-groups-${theme}-${width}`)
    }
    await ctx.close()
  }

  // Offline check: let the service worker install, go offline, reload.
  const ctx = await browser.newContext({ viewport: { width: 400, height: 800 } })
  const page = await ctx.newPage()
  await page.goto(URL)
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  await page.reload()
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  await ctx.setOffline(true)
  await page.goto(`${URL}/settings`)
  const ok = await page
    .getByRole('heading', { level: 1, name: 'Settings' })
    .waitFor({ timeout: 8000 })
    .then(() => true)
    .catch(() => false)
  const fontsOk = await page.evaluate(async () => {
    await document.fonts.ready
    return [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family)
  })
  console.log(`offline reload: ${ok ? 'OK' : 'FAILED'}; fonts loaded offline: ${JSON.stringify(fontsOk)}`)
  await ctx.close()
  await browser.close()
  if (!ok) process.exitCode = 1
} finally {
  stop()
}
