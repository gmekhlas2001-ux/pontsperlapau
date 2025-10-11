import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/',  // ✅ Netlify expects root
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
})
