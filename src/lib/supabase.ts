import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

/**
 * The app uses a custom HMAC session-token auth flow (not Supabase Auth).
 * We never want the JS client to attach an Authorization JWT to requests:
 *   1. RLS policies are written for the anon role.
 *   2. If an `authenticated` JWT slips into the client (stale or invalid),
 *      every write breaks with 401 Unauthorized at the API gateway.
 *
 * Strategy:
 *   - Wipe every `sb-*` key in localStorage on import (defensive cleanup).
 *   - Provide an explicit no-op storage so the client cannot persist or
 *     read sessions even if it tries.
 *   - Disable autoRefreshToken / detectSessionInUrl so no automatic
 *     auth flows kick in.
 */

// Defensive: nuke any Supabase Auth state from previous builds.
if (typeof window !== 'undefined') {
  try {
    // localStorage
    Object.keys(window.localStorage).forEach((key) => {
      if (key.startsWith('sb-') || key.startsWith('supabase.auth.')) {
        window.localStorage.removeItem(key);
      }
    });
    // sessionStorage
    Object.keys(window.sessionStorage).forEach((key) => {
      if (key.startsWith('sb-') || key.startsWith('supabase.auth.')) {
        window.sessionStorage.removeItem(key);
      }
    });
  } catch {
    /* ignore */
  }
}

// No-op storage: pretends to read/write but discards everything.
// Forces the auth client to behave as if no session ever exists.
const noopStorage = {
  getItem: (_: string) => null,
  setItem: (_: string, __: string) => undefined,
  removeItem: (_: string) => undefined,
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
    storage: noopStorage as any,
  },
  global: {
    // Force the anon key as Authorization on every request, regardless of
    // any auth-client state. PostgREST's gateway needs a valid 3-part JWT
    // here; the anon key always satisfies that.
    headers: {
      Authorization: `Bearer ${supabaseAnonKey}`,
      apikey: supabaseAnonKey,
    },
    // Custom fetch wrapper that overrides the Authorization header AFTER
    // supabase-js sets its own. This is the bulletproof guarantee.
    fetch: (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers ?? {});
      headers.set('Authorization', `Bearer ${supabaseAnonKey}`);
      headers.set('apikey', supabaseAnonKey);
      return fetch(input, { ...init, headers });
    },
  },
});
