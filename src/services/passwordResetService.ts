import { supabase } from '@/lib/supabase';
import { callEdgeFunction } from '@/lib/edge';
import { getCurrentScope } from '@/lib/scope';

export interface PasswordResetRequest {
  id: string;
  user_id: string | null;
  email_tried: string;
  status: 'pending' | 'resolved' | 'rejected';
  reason: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  resolved_note: string | null;
  ip: string | null;
  created_at: string;
  user?: {
    id: string;
    first_name: string;
    last_name: string;
    role: string;
    branch_id: string | null;
    branch?: { id: string; name: string } | null;
  } | null;
}

/**
 * Submit a forgot-password request from the public login page. Always
 * returns success-shaped from the server — the UI can't tell whether the
 * email matched a real user (anti-enumeration).
 */
export async function submitPasswordResetRequest(email: string, reason?: string) {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/request-password-reset`;
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${anon}`,
        'apikey': anon,
      },
      body: JSON.stringify({ email, reason }),
    });
    if (!res.ok) {
      const result = await res.json().catch(() => ({}));
      return { success: false, error: result?.error || 'Could not submit request' };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message ?? 'Network error' };
  }
}

/** List password reset requests scoped to the current user's role. */
export async function listPasswordResetRequests(opts?: { status?: 'pending' | 'resolved' | 'rejected' | 'all' }) {
  try {
    const scope = getCurrentScope();
    let q = supabase
      .from('password_reset_requests')
      .select(`
        *,
        user:users!user_id(
          id, first_name, last_name, role, branch_id,
          branch:branches!branch_id(id, name)
        )
      `)
      .order('created_at', { ascending: false });

    if (opts?.status && opts.status !== 'all') {
      q = q.eq('status', opts.status);
    }

    const { data, error } = await q;
    if (error) throw error;

    let rows = (data ?? []) as PasswordResetRequest[];

    // Branch admins only see requests whose user is in their branch.
    // (Requests with no matching user are visible only to superadmins.)
    if (!scope.isGlobal && scope.branchId) {
      rows = rows.filter((r) => r.user?.branch_id === scope.branchId);
    } else if (!scope.isGlobal) {
      rows = [];
    }

    return { success: true, data: rows };
  } catch (err: any) {
    return { success: false, error: err.message ?? 'Failed to load requests' };
  }
}

/**
 * Resolve a pending request by setting a new password on the user.
 * The atomic password-update + status-flip happens server-side in the
 * resolve-password-reset edge function (using the service role) because
 * password_reset_requests rows are not writable from the browser.
 */
export async function resolvePasswordResetRequest(
  requestId: string,
  _targetUserId: string,
  newPassword: string,
  note?: string,
) {
  if (newPassword.length < 8) {
    return { success: false, error: 'Password must be at least 8 characters' };
  }
  const res = await callEdgeFunction('resolve-password-reset', {
    requestId,
    operation: 'resolve',
    newPassword,
    note,
  });
  if (!res.ok) return { success: false, error: res.error || 'Failed to resolve request' };
  return { success: true };
}

/** Mark a request as rejected without changing the password. */
export async function rejectPasswordResetRequest(requestId: string, note?: string) {
  const res = await callEdgeFunction('resolve-password-reset', {
    requestId,
    operation: 'reject',
    note,
  });
  if (!res.ok) return { success: false, error: res.error || 'Failed to reject request' };
  return { success: true };
}

/** Quick badge count for pending requests visible to the current user. */
export async function getPendingRequestCount(): Promise<number> {
  const res = await listPasswordResetRequests({ status: 'pending' });
  return res.success && res.data ? res.data.length : 0;
}
