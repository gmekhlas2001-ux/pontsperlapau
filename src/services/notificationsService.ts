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
 * Other modules add their own table-derived signals below.
 */

import { supabase } from '@/lib/supabase';
import { getCurrentScope } from '@/lib/scope';

export type NotificationKind =
  | 'password_reset'
  | 'pending_transaction'
  | 'overdue_book'
  | 'new_message'
  | 'new_survey'
  | 'fee_due'
  | 'new_grant'
  | 'new_user';

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
        .lt('due_date', new Date().toISOString().slice(0, 10))
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

  // ── 4. Unread messages (everyone with a user id) ─────────────────
  if (scope.userId) {
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('id, subject, body, created_at, sender:users!sender_id(first_name, last_name)')
        .eq('recipient_id', scope.userId)
        .is('read_at', null)
        .order('created_at', { ascending: false })
        .limit(10);

      if (!error && data) {
        for (const m of data as any[]) {
          const sender = m.sender
            ? `${m.sender.first_name ?? ''} ${m.sender.last_name ?? ''}`.trim()
            : 'Someone';
          const preview = (m.subject || m.body || '').slice(0, 80);
          out.push({
            id: `msg:${m.id}`,
            kind: 'new_message',
            title: `New message from ${sender || 'a colleague'}`,
            message: preview || '(no subject)',
            link: '/messages',
            createdAt: m.created_at,
          });
        }
      }
    } catch { /* ignore */ }
  }

  // ── 5. New active surveys in last 7 days (admin/superadmin) ──────
  if (scope.role === 'superadmin' || scope.role === 'admin') {
    try {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('surveys')
        .select('id, title, created_at, status')
        .eq('status', 'active')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(5);

      if (!error && data) {
        for (const s of data as any[]) {
          out.push({
            id: `srv:${s.id}`,
            kind: 'new_survey',
            title: 'New survey published',
            message: s.title,
            link: '/surveys',
            createdAt: s.created_at,
          });
        }
      }
    } catch { /* ignore */ }
  }

  // ── 6. Fees due / overdue (admin/teacher/superadmin) ─────────────
  if (['superadmin', 'admin', 'teacher'].includes(scope.role)) {
    try {
      const horizon = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      let q = supabase
        .from('student_fees')
        .select('id, description, amount, currency, due_date, branch_id, student:students!student_id(user:users!user_id(first_name, last_name))')
        .eq('status', 'pending')
        .lte('due_date', horizon)
        .order('due_date', { ascending: true })
        .limit(5);
      if (scope.branchId && !scope.isGlobal) q = q.eq('branch_id', scope.branchId);

      const { data, error } = await q;
      if (!error && data) {
        const today = new Date().toISOString().slice(0, 10);
        for (const f of data as any[]) {
          const name = f.student?.user
            ? `${f.student.user.first_name ?? ''} ${f.student.user.last_name ?? ''}`.trim()
            : 'A student';
          const overdue = f.due_date < today;
          out.push({
            id: `fee:${f.id}`,
            kind: 'fee_due',
            title: overdue ? 'Fee overdue' : 'Fee due soon',
            message: `${name}: ${Number(f.amount).toLocaleString()} ${f.currency} — ${f.description}`,
            link: '/fees',
            createdAt: f.due_date,
          });
        }
      }
    } catch { /* ignore */ }
  }

  // ── 7. New grants in last 7 days (admin/superadmin) ──────────────
  if (scope.role === 'superadmin' || scope.role === 'admin') {
    try {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      let q = supabase
        .from('grants')
        .select('id, title, amount, currency, created_at, branch_id, donor:donors!donor_id(name)')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(5);
      if (scope.branchId && !scope.isGlobal) q = q.eq('branch_id', scope.branchId);

      const { data, error } = await q;
      if (!error && data) {
        for (const g of data as any[]) {
          out.push({
            id: `grt:${g.id}`,
            kind: 'new_grant',
            title: 'New grant recorded',
            message: `${g.donor?.name ?? 'Donor'}: ${Number(g.amount).toLocaleString()} ${g.currency} — ${g.title}`,
            link: '/donors',
            createdAt: g.created_at,
          });
        }
      }
    } catch { /* ignore */ }
  }

  // ── 8. New users registered in last 7 days (admin/superadmin) ────
  if (scope.role === 'superadmin' || scope.role === 'admin') {
    try {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      let q = supabase
        .from('users_public')
        .select('id, first_name, last_name, role, created_at, branch_id')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(5);
      if (scope.branchId && !scope.isGlobal) q = q.eq('branch_id', scope.branchId);

      const { data, error } = await q;
      if (!error && data) {
        for (const u of data as any[]) {
          if (u.id === scope.userId) continue; // skip self
          const name = `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || 'A new account';
          out.push({
            id: `usr:${u.id}`,
            kind: 'new_user',
            title: `New ${u.role ?? 'user'} added`,
            message: name,
            link: u.role === 'student' ? '/students' : '/staff',
            createdAt: u.created_at,
          });
        }
      }
    } catch { /* ignore */ }
  }

  // Sort newest first.
  out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return out.slice(0, 20);
}
