/**
 * Edge Function Client
 *
 * Provides a unified HTTP client for invoking Supabase Edge Functions from
 * the browser. All requests are authenticated via a custom HMAC session token
 * (not Supabase JWT) passed in the X-Session-Token header.
 *
 * Design rationale:
 * - Centralizes request/response handling so individual service modules don't
 *   duplicate fetch logic or error mapping.
 * - Automatically detects 401 responses and forces a client-side logout,
 *   ensuring stale sessions never leave the user in a broken UI state.
 * - Returns a discriminated result object ({ ok, status, data?, error? })
 *   rather than throwing, so callers can handle failures declaratively.
 *
 * Headers sent on every request:
 *   - Authorization: Bearer <anon-key>   (required by the Supabase gateway)
 *   - apikey: <anon-key>                 (alternative gateway auth header)
 *   - X-Session-Token: <HMAC token>      (verified by our function logic)
 */

import { clearSession, getSessionToken } from '@/lib/session';

// ─── Session Invalidation ────────────────────────────────────────────────────

/**
 * Clears local credentials and redirects to the login page.
 * Called when the server signals that the session is no longer valid (401),
 * or when no token exists prior to making a request.
 */
function forceLogout() {
  clearSession();
  if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
    window.location.href = '/login';
  }
}

// ─── Edge Function Invocation ────────────────────────────────────────────────

/**
 * Invoke a Supabase Edge Function by name with a JSON request body.
 *
 * @param name  - The function name as deployed (e.g. "login", "create-user").
 * @param body  - Arbitrary JSON-serializable payload.
 * @returns A normalized result object. Callers never need try/catch — network
 *          failures are surfaced as `{ ok: false, status: 0 }`.
 */
export async function callEdgeFunction<T = any>(
  name: string,
  body: unknown,
): Promise<{ ok: boolean; status: number; data?: T; error?: string }> {
  // Fail fast if no token exists — avoids a round-trip that would 401 anyway.
  const token = getSessionToken();
  if (!token) {
    forceLogout();
    return { ok: false, status: 401, error: 'Session expired. Please log in again.' };
  }

  // Build the canonical Edge Function URL from environment config.
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${name}`;
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${anon}`,
        'apikey': anon,
        'X-Session-Token': token,
      },
      body: JSON.stringify(body),
    });

    // Gracefully handle non-JSON responses (e.g. gateway errors).
    const result = await res.json().catch(() => ({}));
    if (res.status === 401) {
      // Token rejected server-side — force re-authentication.
      forceLogout();
      return { ok: false, status: 401, error: 'Session expired. Please log in again.' };
    }
    if (!res.ok) {
      return { ok: false, status: res.status, error: result?.error || 'Request failed' };
    }
    return { ok: true, status: res.status, data: result as T };
  } catch (err: any) {
    // Network-level failure (offline, DNS, CORS block, etc.).
    return { ok: false, status: 0, error: err?.message ?? 'Network error' };
  }
}
