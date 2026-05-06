/**
 * Notification feed for the header bell.
 *
 * The app has no push/email infrastructure, so "notifications" here are
 * just real-time signals derived from existing tables — things the
 * current user might want to act on right now.
 *
 * What gets surfaced depends on the user's role and branch:
 *
 *   superadmin / admin:
 *     - pending password-reset requests (branch-scoped for admins)
 *     - pending money transactions involving their branch
 *
 *   teacher / librarian:
 *     - overdue books in their branch (best-effort)
 *
 *   everyone:
 *     - app-level info (none yet — placeholder)
 */

import { supabase } from '@/lib/supabase';
import { getCurrentScope } from '@/lib/scope';

export type NotificationKind =
  | 'password_reset'
  | 'pending_transaction'
  | 'overdue_book';

export interface Notification {
  id: string;             // unique within the response
  kind: NotificationKind;
  title: string;
  message: string;
  link?: string;          // route to navigate to on click
  createdAt: string;      // ISO timestamp
}

const TODAY = () => new Date().toISOString();

export async function fetchNotifications(): Promise<Notification[]> {
  const scope = getCurrentScope();
  if (!scope.role) return [];

  const out: Notification[] = [];

  // ── 1. Pending password reset requests (admin/superadmin) ─────────
  if (scope.role === 'superadmin' || scope.role === 'admin') {
    try {
      const q = supabase
        .from('password_reset_requests')
        .select('id, email_tried, created_at, user:users!user_id(branch_id, first_name, last_name)')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(10);

      const { data, error } = await q;
      if (!error && data) {
        const filtered = scope.isGlobal
          ? data
          : data.filter((r: any) => !r.user || r.user.branch_id === scope.branchId);

        for (const r of filtered as any[]) {
          const name = r.user
            ? `${r.user.first_name ?? ''} ${r.user.last_name ?? ''}`.trim()
            : r.email_tried;
          out.push({
            id: `prr:${r.id}`,
            kind: 'password_reset',
            title: 'Password reset request',
            message: `${name || r.email_tried} is asking for a new password.`,
            link: '/password-resets',
            createdAt: r.created_at,
          });
        }
      }
    } catch { /* ignore */ }
  }

  // ── 2. Pending transactions (admin/superadmin) ────────────────────
  if (scope.role === 'superadmin' || scope.role === 'admin') {
    try {
      let q = supabase
        .from('transactions')
        .select('id, amount, currency, created_at, sender_branch:branches!sender_branch_id(name), receiver_branch:branches!receiver_branch_id(name)')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(10);

      if (scope.branchId && !scope.isGlobal) {
        q = q.or(`sender_branch_id.eq.${scope.branchId},receiver_branch_id.eq.${scope.branchId}`);
      }

      const { data, error } = await q;
      if (!error && data) {
        for (const t of data as any[]) {
          const route = t.sender_branch?.name && t.receiver_branch?.name
            ? `${t.sender_branch.name} → ${t.receiver_branch.name}`
            : '';
          out.push({
            id: `txn:${t.id}`,
            kind: 'pending_transaction',
            title: 'Transaction pending',
            message: `${Number(t.amount).toLocaleString()} ${t.currency}${route ? ` · ${route}` : ''}`,
            link: '/reports',
            createdAt: t.created_at,
          });
        }
      }
    } catch { /* ignore */ }
  }

  // ── 3. Overdue books (everyone with library access) ──────────────
  if (['superadmin', 'admin', 'teacher', 'librarian'].includes(scope.role)) {
    try {
      let q = supabase
        .from('book_borrowings')
        .select('id, borrowed_date, due_date, book:books!inner(title, branch_id)')
        .eq('is_overdue', true)
        .is('returned_date', null)
        .order('due_date', { ascending: true })
        .limit(5);

      if (scope.branchId && !scope.isGlobal) {
        q = q.eq('book.branch_id', scope.branchId);
      }

      const { data, error } = await q;
      if (!error && data) {
        for (const b of data as any[]) {
          if (!b.book) continue; // join filter dropped it
          out.push({
            id: `bor:${b.id}`,
            kind: 'overdue_book',
            title: 'Overdue book',
            message: `${b.book.title} — was due ${new Date(b.due_date).toLocaleDateString()}`,
            link: '/library',
            createdAt: b.due_date ?? TODAY(),
          });
        }
      }
    } catch { /* ignore */ }
  }

  // Sort newest first.
  out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return out.slice(0, 15);
}
