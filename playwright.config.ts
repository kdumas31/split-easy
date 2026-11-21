import { defineConfig, devices } from '@playwright/test'

// Deliberately light (PLAN.md §7): Chromium only, one worker, no video, no retries.
// If port 8840 is busy, close the Split Easy launcher first (strictPort makes this fail loudly).
export default defineConfig({
  testDir: 'tests/e2e',
  workers: 1,
  retries: 0,
  fullyParallel: false,
  reporter: [['list']],
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:8840',
    headless: true,
    video: 'off',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 420, height: 900 } } }],
  webServer: {
    command: 'npm run build && npx vite preview --port 8840 --strictPort --host localhost',
    url: 'http://localhost:8840',
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})
