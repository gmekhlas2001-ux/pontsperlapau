import { supabase } from '@/lib/supabase';
import { logActivity } from '@/services/activityService';

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
  branchId?: string;
  bio?: string;
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
          branchId: data.branchId,
          bio: data.bio,
        },
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      return { success: false, error: result.error || 'Failed to create staff member' };
    }

    logActivity({ action_type: 'INSERT', table_name: 'staff', description: `Added staff: ${data.firstName} ${data.lastName}` });
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
  branchId?: string;
  bio?: string;
}

export async function updateStaff(staffId: string, userId: string, data: UpdateStaffData) {
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
      body: JSON.stringify({
        targetUserId: userId,
        firstName: data.firstName,
        lastName: data.lastName,
        fatherName: data.fatherName,
        phone: data.phone,
        role: data.role,
        status: data.status,
        staffData: {
          staffId,
          position: data.position,
          department: data.department,
          dateJoined: data.dateJoined,
          branchId: data.branchId,
          bio: data.bio,
        },
      }),
    });

    const result = await response.json();
    if (!response.ok) return { success: false, error: result.error || 'Failed to update staff member' };
    logActivity({ action_type: 'UPDATE', table_name: 'staff', description: `Updated staff member` });
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

export async function deleteStaff(_staffId: string, userId: string) {
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
      body: JSON.stringify({ targetUserId: userId, operation: 'delete' }),
    });

    const result = await response.json();
    if (!response.ok) return { success: false, error: result.error || 'Failed to delete staff member' };
    logActivity({ action_type: 'DELETE', table_name: 'staff', description: `Removed staff member` });
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
