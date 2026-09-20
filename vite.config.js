import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ command }) => ({
  // Dev server runs at localhost:5173/ ; production build uses /omaxfx/ for GitHub Pages
  base: command === 'serve' ? '/' : '/omaxfx/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'sounds/*.mp3', 'data/*.csv'],
      // Enable PWA in dev mode so we can test the install experience
      devOptions: {
        enabled: true,
        type: 'module',
        navigateFallback: 'index.html',
      },
      manifest: {
        name: 'OmaxFX Game',
        short_name: 'OmaxFX',
        description: 'Replay trading simulator with drawing tools and challenge rules',
        theme_color: '#0b0e11',
        background_color: '#0b0e11',
        display: 'standalone',
        orientation: 'any',
        start_url: './',
        scope: './',
        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Cache every asset type we use: HTML, JS, CSS, images, sounds, data
        globPatterns: ['**/*.{js,css,html,svg,png,mp3,csv,ico}'],
        // CSV is ~5MB, MP3 is ~2MB — raise the cache limit
        maximumFileSizeToCacheInBytes: 15 * 1024 * 1024,
        // When offline, always serve the cached index.html (SPA behavior)
        navigateFallback: 'index.html',
      },
    }),
  ],
}))