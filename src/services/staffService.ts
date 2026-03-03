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
        'X-API-Key': user.id,
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
