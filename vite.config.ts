import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

// Split Easy only ever runs on http://localhost:8840 (strictPort: fail loudly, never drift).
const local = { port: 8840, strictPort: true, host: 'localhost' } as const

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: local,
  preview: local,
  build: {
    target: 'es2022',
    assetsInlineLimit: 0, // keep fonts as real files so the SW precaches them
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false, // we register manually from UpdateBanner (prod only)
      devOptions: { enabled: false },
      includeAssets: ['favicon.svg', 'icon.svg', 'icons/apple-touch-icon-180.png'],
      manifest: {
        name: 'Split Easy',
        short_name: 'Split Easy',
        description: 'Fair shares, no fuss. Split trip, rent, and dinner costs with no account.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#FBF5EC',
        theme_color: '#B4482A',
        icons: [
          { src: '/icons/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2,svg,png,webmanifest}'],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
})
