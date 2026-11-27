import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ command }) => ({
  // GitHub project pages need the repository prefix; a verified custom domain
  // serves from the root. Desktop builds keep relative asset paths for offline use.
  base: command === 'serve' || process.env.TRADEPAST_CUSTOM_DOMAIN === '1'
    ? '/'
    : (process.env.TRADEPAST_DESKTOP === '1' ? './' : '/omaxfx/'),
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['tradepast-logo.svg', 'sounds/*.mp3'],
      devOptions: {
        enabled: true,
        type: 'module',
        navigateFallback: 'index.html',
      },
      manifest: {
        name: 'TradePast — Trading Replay Simulator',
        short_name: 'TradePast',
        description: 'TradePast trading simulator and market replay engine. Replay markets, test strategies, master your edge.',
        theme_color: '#0b0e11',
        background_color: '#0b0e11',
        display: 'standalone',
        display_override: ['fullscreen', 'standalone'],
        orientation: 'landscape',
        start_url: './',
        scope: './',
        icons: [
          { src: 'tradepast-logo.svg?v=3', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
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
