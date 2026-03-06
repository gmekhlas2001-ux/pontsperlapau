import { supabase } from '@/lib/supabase';

export interface OrgSettings {
  org_name: string;
  org_email: string;
  org_phone: string;
  timezone: string;
  date_format: string;
  academic_year: string;
  attendance_low_threshold: string;
  library_lending_period_days: string;
  max_book_renewal_count: string;
  max_books_per_user: string;
  overdue_fine_per_day: string;
  enable_email_notifications: string;
  notifications_push: string;
  notifications_enrollment: string;
  notifications_book_due: string;
  notifications_overdue: string;
  notifications_low_attendance: string;
  session_timeout_minutes: string;
}

export async function getOrgSettings(): Promise<{ success: boolean; data?: OrgSettings; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('organization_settings')
      .select('setting_key, setting_value');

    if (error) throw error;

    const map: Record<string, string> = {};
    (data || []).forEach((row: any) => {
      map[row.setting_key] = row.setting_value ?? '';
    });

    const settings: OrgSettings = {
      org_name: map.org_name ?? 'My Organization',
      org_email: map.org_email ?? '',
      org_phone: map.org_phone ?? '',
      timezone: map.timezone ?? 'Europe/Madrid',
      date_format: map.date_format ?? 'DD/MM/YYYY',
      academic_year: map.academic_year ?? '',
      attendance_low_threshold: map.attendance_low_threshold ?? '80',
      library_lending_period_days: map.library_lending_period_days ?? '14',
      max_book_renewal_count: map.max_book_renewal_count ?? '2',
      max_books_per_user: map.max_books_per_user ?? '3',
      overdue_fine_per_day: map.overdue_fine_per_day ?? '0.50',
      enable_email_notifications: map.enable_email_notifications ?? 'true',
      notifications_push: map.notifications_push ?? 'true',
      notifications_enrollment: map.notifications_enrollment ?? 'true',
      notifications_book_due: map.notifications_book_due ?? 'true',
      notifications_overdue: map.notifications_overdue ?? 'true',
      notifications_low_attendance: map.notifications_low_attendance ?? 'true',
      session_timeout_minutes: map.session_timeout_minutes ?? '60',
    };

    return { success: true, data: settings };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function saveOrgSettings(updates: Partial<OrgSettings>): Promise<{ success: boolean; error?: string }> {
  try {
    const entries = Object.entries(updates);
    for (const [key, value] of entries) {
      const { error } = await supabase
        .from('organization_settings')
        .upsert(
          { setting_key: key, setting_value: String(value) },
          { onConflict: 'setting_key' }
        );
      if (error) throw error;
    }
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function changePassword(
  userId: string,
  userEmail: string,
  currentPassword: string,
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: isValid } = await supabase.rpc('verify_password', {
      user_email: userEmail.toLowerCase(),
      user_password: currentPassword,
    });

    if (!isValid) {
      return { success: false, error: 'Current password is incorrect' };
    }

    const { data: newHash, error: hashError } = await supabase.rpc('hash_password', {
      password: newPassword,
    });

    if (hashError || !newHash) {
      throw hashError || new Error('Failed to hash password');
    }

    const { error: updateError } = await supabase
      .from('users')
      .update({ password_hash: newHash })
      .eq('id', userId);

    if (updateError) throw updateError;

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function toggle2FA(userId: string, enabled: boolean): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('users')
      .update({ two_factor_enabled: enabled })
      .eq('id', userId);

    if (error) throw error;
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function getUser2FAStatus(userId: string): Promise<{ success: boolean; enabled?: boolean; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('two_factor_enabled')
      .eq('id', userId)
      .maybeSingle();

    if (error) throw error;
    return { success: true, enabled: data?.two_factor_enabled ?? false };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export interface RoleWithPermissions {
  id: string;
  name: string;
  description: string | null;
  isSystemRole: boolean;
  permissions: Array<{ name: string; resource: string; action: string }>;
}

export async function getRolesWithPermissions(): Promise<{ success: boolean; data?: RoleWithPermissions[]; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('roles')
      .select(`
        id,
        name,
        description,
        is_system_role,
        role_permissions(
          permission:permissions!permission_id(name, resource, action)
        )
      `)
      .order('name');

    if (error) throw error;

    const roles: RoleWithPermissions[] = (data || []).map((r: any) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      isSystemRole: r.is_system_role,
      permissions: (r.role_permissions || [])
        .map((rp: any) => rp.permission)
        .filter(Boolean)
        .sort((a: any, b: any) => a.name.localeCompare(b.name)),
    }));

    return { success: true, data: roles };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export interface ActivityLog {
  id: string;
  userId: string | null;
  actionType: string;
  tableName: string | null;
  description: string | null;
  createdAt: string;
  userFirstName?: string;
  userLastName?: string;
}

export async function getActivityLogs(limit = 50): Promise<{ success: boolean; data?: ActivityLog[]; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('activity_logs')
      .select(`
        id,
        user_id,
        action_type,
        table_name,
        description,
        created_at,
        user:users!user_id(first_name, last_name)
      `)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    const logs: ActivityLog[] = (data || []).map((l: any) => ({
      id: l.id,
      userId: l.user_id,
      actionType: l.action_type,
      tableName: l.table_name,
      description: l.description,
      createdAt: l.created_at,
      userFirstName: l.user?.first_name,
      userLastName: l.user?.last_name,
    }));

    return { success: true, data: logs };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function exportTableAsCSV(tableName: 'users' | 'staff' | 'students' | 'classes' | 'books'): Promise<{ success: boolean; csv?: string; error?: string }> {
  try {
    let query;

    if (tableName === 'users') {
      const { data, error } = await supabase
        .from('users')
        .select('id, email, first_name, last_name, role, status, created_at')
        .is('status', null)
        .or('status.eq.active,status.eq.inactive');
      if (error) throw error;
      query = data;
    } else if (tableName === 'staff') {
      const { data, error } = await supabase
        .from('staff')
        .select('id, user_id, position, department, employee_id, date_joined, employment_type, created_at')
        .is('deleted_at', null);
      if (error) throw error;
      query = data;
    } else if (tableName === 'students') {
      const { data, error } = await supabase
        .from('students')
        .select('id, student_id, grade_level, enrollment_date, nationality, created_at')
        .is('deleted_at', null);
      if (error) throw error;
      query = data;
    } else if (tableName === 'classes') {
      const { data, error } = await supabase
        .from('classes')
        .select('id, name, description, location, max_capacity, academic_year, semester, status, created_at')
        .is('deleted_at', null);
      if (error) throw error;
      query = data;
    } else {
      const { data, error } = await supabase
        .from('books')
        .select('id, title, author, isbn, publisher, category, total_copies, available_copies, created_at')
        .is('deleted_at', null);
      if (error) throw error;
      query = data;
    }

    if (!query || query.length === 0) {
      return { success: true, csv: '' };
    }

    const headers = Object.keys(query[0]).join(',');
    const rows = query.map((row: any) =>
      Object.values(row).map((v: any) => (typeof v === 'string' && v.includes(',') ? `"${v}"` : v ?? '')).join(',')
    );
    const csv = [headers, ...rows].join('\n');

    return { success: true, csv };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function getSystemStats(): Promise<{ success: boolean; data?: Record<string, number>; error?: string }> {
  try {
    const [usersRes, staffRes, studentsRes, classesRes, booksRes] = await Promise.all([
      supabase.from('users').select('id', { count: 'exact', head: true }),
      supabase.from('staff').select('id', { count: 'exact', head: true }).is('deleted_at', null),
      supabase.from('students').select('id', { count: 'exact', head: true }).is('deleted_at', null),
      supabase.from('classes').select('id', { count: 'exact', head: true }).is('deleted_at', null),
      supabase.from('books').select('id', { count: 'exact', head: true }).is('deleted_at', null),
    ]);

    return {
      success: true,
      data: {
        users: usersRes.count ?? 0,
        staff: staffRes.count ?? 0,
        students: studentsRes.count ?? 0,
        classes: classesRes.count ?? 0,
        books: booksRes.count ?? 0,
      },
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
