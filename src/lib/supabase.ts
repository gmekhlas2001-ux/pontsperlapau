import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

/**
 * The app uses a custom HMAC session-token auth flow (not Supabase Auth).
 * We never want the JS client to attach an Authorization JWT to requests,
 * because:
 *   1. RLS policies are written for the `anon` role.
 *   2. If an `authenticated` JWT slips into the client (e.g. from a stray
 *      auth call or persisted session), every write breaks with
 *      "row-level security policy violation" since no policies cover
 *      `authenticated`.
 *
 * Disabling persistSession + autoRefreshToken keeps every request anonymous,
 * matching how the system is designed.
 */

// One-time cleanup: purge any stale Supabase auth tokens left in localStorage
// from before this change. Without this, existing users would keep hitting the
// authenticated-role bug until they manually cleared site data.
if (typeof window !== 'undefined') {
  try {
    Object.keys(window.localStorage).forEach((key) => {
      if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
        window.localStorage.removeItem(key);
      }
    });
  } catch {
    /* ignore */
  }
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});
