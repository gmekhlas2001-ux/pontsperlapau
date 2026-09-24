import { supabase } from '@/lib/supabase';

/** Database-generated operational history. Legacy client entries retain their source label. */
export interface ActivityLog {
  id: string;
  user_id: string | null;
  action_type: string;
  table_name: string;
  record_id: string | null;
  description: string | null;
  created_at: string;
  event_source?: 'legacy_client' | 'database' | 'edge';
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
