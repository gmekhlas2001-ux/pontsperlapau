import { supabase } from '@/lib/supabase';

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

    await supabase.from('activity_logs').insert({
      user_id: userId,
      action_type: params.action_type,
      table_name: params.table_name,
      record_id: params.record_id || null,
      description: params.description,
    });
  } catch {
  }
}

export async function fetchRecentActivities(limit = 10): Promise<ActivityLog[]> {
  try {
    const { data, error } = await supabase
      .from('activity_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return (data ?? []) as ActivityLog[];
  } catch {
    return [];
  }
}
