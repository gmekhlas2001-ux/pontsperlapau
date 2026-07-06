import { supabase } from '@/lib/supabase';
import { callEdgeFunction } from '@/lib/edge';

/**
 * Activity audit log.
 *
 * NOTE on trust: the Edge Function derives `user_id` from the verified
 * session, validates field sizes, and writes with the service role. The
 * browser still supplies the human-readable description, so this remains
 * operational history rather than a tamper-evident compliance ledger.
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
    const res = await callEdgeFunction('app-actions', {
      operation: 'log-activity',
      actionType: params.action_type,
      tableName: params.table_name,
      recordId: params.record_id || null,
      description: params.description,
    });
    if (!res.ok) console.warn('[activity] insert failed:', res.error);
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
