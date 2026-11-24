import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ command, mode }) => ({
  // The hosted web app keeps its /omaxfx/ path; Electron loads dist/index.html
  // directly, so desktop assets must use relative paths.
  base: mode === 'desktop' ? './' : command === 'serve' ? '/' : '/omaxfx/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['omaxfx-logo.svg', 'sounds/*.mp3'],
      devOptions: {
        enabled: true,
        type: 'module',
        navigateFallback: 'index.html',
      },
      manifest: {
        name: 'OmaxFX Simulator',
        short_name: 'OmaxFX',
        description: 'Professional trading simulator and replay engine for XAUUSD. Replay markets, test strategies, master your edge.',
        theme_color: '#0b0e11',
        background_color: '#0b0e11',
        display: 'standalone',
        display_override: ['fullscreen', 'standalone'],
        orientation: 'landscape',
        start_url: './',
        scope: './',
        icons: [
          { src: 'omaxfx-logo.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,mp3,ico,json}'],
        maximumFileSizeToCacheInBytes: 30 * 1024 * 1024,
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            urlPattern: /\/data\/.*\.csv(?:\?.*)?$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'csv-cache-v2',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
}))
