import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/pontsperlapau/',           // 👈 required for GitHub Pages project sites
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
})
