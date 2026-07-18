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
      registerType: 'autoUpdate',
      // Registration is handled in src/pwa/registerServiceWorker.ts so the
      // page can reload as soon as a newly activated worker takes control.
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
        skipWaiting: true,
        // Existing installations currently have only a bare registration
        // script. This bridge advances those already-open clients once so
        // they can adopt the permanent page-side update flow.
        importScripts: ['/pwa-update-bridge-v1.js'],
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
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('/exceljs')) return 'vendor-excel';
          if (id.includes('/jspdf') || id.includes('/html2canvas') || id.includes('/dompurify')) return 'vendor-pdf';
          if (id.includes('/recharts') || id.includes('/d3-') || id.includes('/victory-vendor')) return 'vendor-charts';
          if (id.includes('/@supabase')) return 'vendor-supabase';
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/vitest.setup.ts'],
    css: false,
  },
}));
