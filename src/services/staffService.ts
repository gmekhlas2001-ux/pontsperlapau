import { supabase } from '@/lib/supabase';

export interface CreateStaffData {
  firstName: string;
  lastName: string;
  fatherName?: string;
  dateOfBirth: string;
  gender: 'male' | 'female' | 'other' | 'prefer_not_to_say';
  passportNumber?: string;
  email: string;
  password: string;
  phone?: string;
  position: string;
  department?: string;
  role: 'superadmin' | 'admin' | 'teacher' | 'librarian';
  dateJoined: string;
}

export async function createStaff(data: CreateStaffData) {
  try {
    const storedUser = localStorage.getItem('user');
    if (!storedUser) {
      return { success: false, error: 'Not authenticated' };
    }

    const user = JSON.parse(storedUser);
    const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`;

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        'X-User-Id': user.id,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: data.email,
        password: data.password,
        firstName: data.firstName,
        lastName: data.lastName,
        phoneNumber: data.phone,
        dateOfBirth: data.dateOfBirth,
        gender: data.gender,
        role: data.role,
        fatherName: data.fatherName,
        passportNumber: data.passportNumber,
        additionalData: {
          position: data.position,
          department: data.department,
          dateJoined: data.dateJoined,
        },
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      return { success: false, error: result.error || 'Failed to create staff member' };
    }

    return { success: true, data: result.roleData };
  } catch (error: any) {
    console.error('Error creating staff:', error);
    return { success: false, error: error.message || 'Failed to create staff member' };
  }
}

export interface UpdateStaffData {
  firstName?: string;
  lastName?: string;
  fatherName?: string;
  phone?: string;
  position?: string;
  department?: string;
  role?: 'superadmin' | 'admin' | 'teacher' | 'librarian';
  status?: 'active' | 'inactive';
  dateJoined?: string;
}

export async function updateStaff(staffId: string, userId: string, data: UpdateStaffData) {
  try {
    const userUpdates: Record<string, string> = {};
    if (data.firstName !== undefined) userUpdates.first_name = data.firstName;
    if (data.lastName !== undefined) userUpdates.last_name = data.lastName;
    if (data.fatherName !== undefined) userUpdates.father_name = data.fatherName;
    if (data.phone !== undefined) userUpdates.phone_number = data.phone;
    if (data.role !== undefined) userUpdates.role = data.role;
    if (data.status !== undefined) userUpdates.status = data.status;

    if (Object.keys(userUpdates).length > 0) {
      const { error: userError } = await supabase
        .from('users')
        .update(userUpdates)
        .eq('id', userId);
      if (userError) throw userError;
    }

    const staffUpdates: Record<string, string> = {};
    if (data.position !== undefined) staffUpdates.position = data.position;
    if (data.department !== undefined) staffUpdates.department = data.department;
    if (data.dateJoined !== undefined) staffUpdates.date_joined = data.dateJoined;

    if (Object.keys(staffUpdates).length > 0) {
      const { error: staffError } = await supabase
        .from('staff')
        .update(staffUpdates)
        .eq('id', staffId);
      if (staffError) throw staffError;
    }

    return { success: true };
  } catch (error: any) {
    console.error('Error updating staff:', error);
    return { success: false, error: error.message || 'Failed to update staff member' };
  }
}

export async function updateUserCredentials(targetUserId: string, email?: string, newPassword?: string) {
  try {
    const storedUser = localStorage.getItem('user');
    if (!storedUser) return { success: false, error: 'Not authenticated' };
    const caller = JSON.parse(storedUser);
    const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/update-user`;
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        'X-User-Id': caller.id,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ targetUserId, email, newPassword }),
    });
    const result = await response.json();
    if (!response.ok) return { success: false, error: result.error || 'Failed to update credentials' };
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to update credentials' };
  }
}

export async function deleteStaff(staffId: string, userId: string) {
  try {
    const { error: staffError } = await supabase
      .from('staff')
      .delete()
      .eq('id', staffId);
    if (staffError) throw staffError;

    const { error: userError } = await supabase
      .from('users')
      .delete()
      .eq('id', userId);
    if (userError) throw userError;

    return { success: true };
  } catch (error: any) {
    console.error('Error deleting staff:', error);
    return { success: false, error: error.message || 'Failed to delete staff member' };
  }
}

export async function getStaffList() {
  try {
    const { data, error } = await supabase
      .from('staff')
      .select(`
        *,
        user:users(*)
      `)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return { success: true, data };
  } catch (error: any) {
    console.error('Error fetching staff:', error);
    return { success: false, error: error.message || 'Failed to fetch staff list' };
  }
}
