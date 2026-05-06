/**
 * Branch-Scope Resolution Layer
 *
 * Multi-tenant access control is enforced at two levels: server-side (edge
 * functions verify the token's branchId claim) and client-side (UI queries
 * are pre-filtered so users never see data outside their branch). This module
 * handles the client-side piece.
 *
 * The app uses a custom HMAC auth flow (no Supabase JWT) and persists the
 * authenticated user in localStorage. Service-layer code calls
 * `getCurrentScope()` to obtain the caller's role and branch, then uses
 * that information to scope Supabase queries before they hit the network.
 *
 * Access model:
 *   superadmin → unrestricted cross-branch access (no scoping applied)
 *   admin      → branch-scoped; manages users/config for one branch
 *   teacher    → branch-scoped; views students, classes, and books
 *   librarian  → branch-scoped; manages books and borrowings
 *   student    → cannot log into the admin panel (blocked at login)
 *
 * This design means the UI never fetches data it shouldn't display, reducing
 * both network cost and the surface area for accidental data leakage.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

/** Union of all roles recognized by the access-control system. */
export type ScopeRole = 'superadmin' | 'admin' | 'teacher' | 'librarian' | 'student';

/** Resolved scope information for the currently logged-in user. */
export interface CurrentScope {
  userId: string | null;
  role: ScopeRole | null;
  branchId: string | null;
  /** True when the caller has unrestricted cross-branch access. */
  isGlobal: boolean;
  /** True when the caller is bound to a single branch. */
  isBranchScoped: boolean;
}

// ─── Default (unauthenticated) Scope ─────────────────────────────────────────

/** Sentinel value returned when no valid user session is available. */
const EMPTY: CurrentScope = {
  userId: null,
  role: null,
  branchId: null,
  isGlobal: false,
  isBranchScoped: false,
};

// ─── Scope Resolution ────────────────────────────────────────────────────────

/**
 * Read the current user's scope from localStorage.
 *
 * Returns an empty (unauthenticated) scope if:
 *   - Running server-side (SSR guard)
 *   - No user payload stored
 *   - Stored JSON is corrupt or missing required fields
 *
 * This function is intentionally synchronous — localStorage access is fast
 * and avoids async overhead in hot paths like query builders.
 */
export function getCurrentScope(): CurrentScope {
  // SSR guard: localStorage is unavailable in server-rendered contexts.
  if (typeof window === 'undefined') return EMPTY;

  const raw = window.localStorage.getItem('user');
  if (!raw) return EMPTY;

  try {
    const u = JSON.parse(raw) as {
      id?: string;
      role?: ScopeRole;
      branchId?: string | null;
    };

    const role = u.role ?? null;
    const branchId = u.branchId ?? null;
    const isGlobal = role === 'superadmin';
    // Anyone who isn't a superadmin and DOES have a branchId is scoped.
    const isBranchScoped = !isGlobal && !!branchId;

    return {
      userId: u.id ?? null,
      role,
      branchId,
      isGlobal,
      isBranchScoped,
    };
  } catch {
    return EMPTY;
  }
}

// ─── Convenience Accessors ───────────────────────────────────────────────────

/**
 * Sentinel UUID returned for non-superadmin users who have no branch assigned.
 * Filtering `branch_id = NO_BRANCH_SENTINEL` will match no rows, giving a
 * deny-by-default experience instead of leaking all data globally.
 */
export const NO_BRANCH_SENTINEL = '00000000-0000-0000-0000-000000000000';

/**
 * Returns the branch_id to use as a query filter, or `null` when the caller
 * has global (superadmin) access and no filter should be applied.
 *
 * For non-superadmin roles WITHOUT a branch_id, returns NO_BRANCH_SENTINEL
 * so queries return empty results rather than leaking everything.
 *
 * Usage pattern:
 *   const branchId = scopedBranchId();
 *   let query = supabase.from('students').select('*');
 *   if (branchId) query = query.eq('branch_id', branchId);
 */
export function scopedBranchId(): string | null {
  const s = getCurrentScope();
  if (s.isGlobal) return null;          // superadmin: no filter
  if (!s.branchId) return NO_BRANCH_SENTINEL; // deny-by-default
  return s.branchId;
}

/**
 * Returns true when the current user is a non-superadmin role that is
 * missing a branch assignment. UI can show a warning banner so admins
 * know they need a superadmin to assign them a branch.
 */
export function hasMissingBranch(): boolean {
  const s = getCurrentScope();
  return !s.isGlobal && !!s.role && !s.branchId;
}
