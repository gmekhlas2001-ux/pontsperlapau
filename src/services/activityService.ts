import { supabase } from '@/lib/supabase';

/**
 * Activity audit log.
 *
 * NOTE on trust: this writes from the browser. The DB-side migration
 * `20260430000002_security_hardening.sql` revokes UPDATE/DELETE on
 * activity_logs from anon, so existing rows cannot be tampered with —
 * but the `user_id` on a freshly-inserted row still comes from the
 * client and could be forged by a malicious caller. Treat
 * activity_logs as best-effort, not a security audit trail.
 *
 * For high-trust operations (user create/update/delete, password change)
 * the edge functions should be the source of truth; activity_logs is a
 * convenience for in-app history.
 */

export interface ActivityLog {
  id: string;
  user_id: string | null;
  action_type: string;
  table_name: string;
  record_id: string | null;
  description: string | null;
  created_at: string;
}

export async function logActivity(params: {
  action_type: string;
  table_name: string;
  record_id?: string;
  description: string;
}) {
  try {
    const storedUser = localStorage.getItem('user');
    const userId = storedUser ? JSON.parse(storedUser).id : null;

    const { error } = await supabase.from('activity_logs').insert({
      user_id: userId,
      action_type: params.action_type,
      table_name: params.table_name,
      record_id: params.record_id || null,
      description: params.description,
    });
    if (error) console.warn('[activity] insert failed:', error.message);
  } catch (err) {
    console.warn('[activity] insert threw:', err);
  }
}

export async function fetchRecentActivities(limit = 10): Promise<ActivityLog[]> {
  try {
    const { data, error } = await supabase
      .from('activity_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.warn('[activity] fetch failed:', error.message);
      return [];
    }
    return (data ?? []) as ActivityLog[];
  } catch (err) {
    console.warn('[activity] fetch threw:', err);
    return [];
  }
}
