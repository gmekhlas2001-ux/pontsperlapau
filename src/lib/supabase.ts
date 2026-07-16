import { createClient } from '@supabase/supabase-js';
import { clearSession, getSessionToken } from '@/lib/session';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

/**
 * The app uses a custom HMAC session-token auth flow (not Supabase Auth).
 * The browser never talks to PostgREST directly. Because this app uses a
 * custom HMAC session rather than Supabase Auth, PostgREST would otherwise see
 * every caller as `anon` and could not enforce per-user/branch authorization.
 * REST reads are transparently routed through the `data-read` Edge Function,
 * which validates the app session and applies server-side scope.
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
    // The anon key authenticates this public client to the Edge gateway. The
    // app's signed session is sent separately and verified by function code.
    headers: {
      Authorization: `Bearer ${supabaseAnonKey}`,
      apikey: supabaseAnonKey,
    },
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      const originalUrl = new URL(
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      );
      const headers = new Headers(init?.headers ?? {});
      headers.set('Authorization', `Bearer ${supabaseAnonKey}`);
      headers.set('apikey', supabaseAnonKey);

      if (originalUrl.pathname.startsWith('/rest/v1/')) {
        const token = getSessionToken();
        if (!token) {
          return new Response(JSON.stringify({ message: 'Authentication required' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        headers.set('X-Session-Token', token);
        const dataPath = `${originalUrl.pathname}${originalUrl.search}`;
        const proxyUrl = new URL('/functions/v1/data-read', supabaseUrl);
        proxyUrl.searchParams.set('path', dataPath);

        const response = await fetch(proxyUrl, { ...init, headers });
        // A stale request may finish after a newer login has already stored a
        // different token. Only invalidate the exact session used here.
        if (response.status === 401 && getSessionToken() === token) {
          clearSession();
          if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
            window.location.href = '/login';
          }
        }
        return response;
      }

      return fetch(input, { ...init, headers });
    },
  },
});
