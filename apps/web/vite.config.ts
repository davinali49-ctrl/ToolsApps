import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['icon.svg', 'pwa-192x192.png', 'pwa-512x512.png', 'maskable-512x512.png'],
      manifest: {
        name: 'ToolsApps — Konversi Berkas & Media',
        short_name: 'ToolsApps',
        description: 'Konversi PDF, Office, gambar, dan unduh media sosial.',
        lang: 'id',
        categories: ['productivity', 'utilities'],
        theme_color: '#080c19',
        background_color: '#080c19',
        display: 'standalone',
        start_url: './',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        // .mjs wajib disertakan: pdf.js memuat worker sebagai modul ES.
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,woff2,wasm}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024
      }
    })
  ],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2500
  },
  server: {
    port: 5173,
    strictPort: true
  }
});
