import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/pontsperlapau/', // ✅ GitHub Pages expects subpath
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
})
