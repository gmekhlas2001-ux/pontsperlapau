import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://djzkvsotucmiegdcfsnr.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRqemt2c290dWNtaWVnZGNmc25yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk5MzM0OTEsImV4cCI6MjA3NTUwOTQ5MX0.TbUV7CTH9CKz2qv0YaePXZtyVsdgfSrsHNAzgwEZPFE';

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});
