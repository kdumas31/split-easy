import { defineConfig } from '@vite-pwa/assets-generator/config'

// Run once with `npm run icons`; the generated PNGs are committed to public/icons/.
export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    transparent: { sizes: [192, 512], favicons: [], padding: 0 },
    maskable: { sizes: [512], padding: 0.3, resizeOptions: { background: '#B4482A' } },
    apple: { sizes: [180], padding: 0.3, resizeOptions: { background: '#B4482A' } },
    assetName: (type, size) => {
      if (type === 'maskable') return `icons/maskable-${size.width}.png`
      if (type === 'apple') return `icons/apple-touch-icon-${size.width}.png`
      return `icons/pwa-${size.width}.png`
    },
  },
  images: ['public/icon.svg'],
})
