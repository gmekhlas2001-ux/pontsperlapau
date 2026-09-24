/// <reference types="vitest" />
import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig(() => ({
  base: '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      // Registration is handled in src/pwa/registerServiceWorker.ts so the
      // user can finish and save their work before activating an update.
      injectRegister: null,
      includeAssets: ['image.png', 'app-icon.svg'],
      manifest: {
        name: 'Ponts per la Pau',
        short_name: 'PpP',
        description: 'School Management System',
        theme_color: '#0d9488',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: 'app-icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024, // 4 MB
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: false,
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    chunkSizeWarningLimit: 1000,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/vitest.setup.ts'],
    css: false,
  },
}));
