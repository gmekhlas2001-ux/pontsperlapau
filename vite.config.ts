import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://djzkvsotucmiegdcfsnr.supabase.co'),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRqemt2c290dWNtaWVnZGNmc25yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk5MzM0OTEsImV4cCI6MjA3NTUwOTQ5MX0.TbUV7CTH9CKz2qv0YaePXZtyVsdgfSrsHNAzgwEZPFE'),
  },
})
