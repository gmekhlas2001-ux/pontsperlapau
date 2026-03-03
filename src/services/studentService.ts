import { supabase } from '@/lib/supabase';

export interface CreateStudentData {
  firstName: string;
  lastName: string;
  fatherName?: string;
  dateOfBirth: string;
  gender: 'male' | 'female' | 'other' | 'prefer_not_to_say';
  passportNumber?: string;
  email: string;
  password: string;
  phone?: string;
  gradeLevel?: string;
  enrollmentDate: string;
}

export interface UpdateStudentData {
  firstName?: string;
  lastName?: string;
  fatherName?: string;
  phone?: string;
  gradeLevel?: string;
  enrollmentDate?: string;
  status?: 'active' | 'inactive';
}

export async function createStudent(data: CreateStudentData) {
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
        role: 'student',
        fatherName: data.fatherName,
        passportNumber: data.passportNumber,
        additionalData: {
          gradeLevel: data.gradeLevel,
          enrollmentDate: data.enrollmentDate,
        },
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      return { success: false, error: result.error || 'Failed to create student' };
    }

    return { success: true, data: result.roleData };
  } catch (error: any) {
    console.error('Error creating student:', error);
    return { success: false, error: error.message || 'Failed to create student' };
  }
}

export async function updateStudent(studentId: string, userId: string, data: UpdateStudentData) {
  try {
    const userUpdates: Record<string, string> = {};
    if (data.firstName !== undefined) userUpdates.first_name = data.firstName;
    if (data.lastName !== undefined) userUpdates.last_name = data.lastName;
    if (data.fatherName !== undefined) userUpdates.father_name = data.fatherName;
    if (data.phone !== undefined) userUpdates.phone_number = data.phone;
    if (data.status !== undefined) userUpdates.status = data.status;

    if (Object.keys(userUpdates).length > 0) {
      const { error: userError } = await supabase
        .from('users')
        .update(userUpdates)
        .eq('id', userId);
      if (userError) throw userError;
    }

    const studentUpdates: Record<string, string> = {};
    if (data.gradeLevel !== undefined) studentUpdates.grade_level = data.gradeLevel;
    if (data.enrollmentDate !== undefined) studentUpdates.enrollment_date = data.enrollmentDate;

    if (Object.keys(studentUpdates).length > 0) {
      const { error: studentError } = await supabase
        .from('students')
        .update(studentUpdates)
        .eq('id', studentId);
      if (studentError) throw studentError;
    }

    return { success: true };
  } catch (error: any) {
    console.error('Error updating student:', error);
    return { success: false, error: error.message || 'Failed to update student' };
  }
}

export async function deleteStudent(studentId: string, userId: string) {
  try {
    const { error: studentError } = await supabase
      .from('students')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', studentId);
    if (studentError) throw studentError;

    const { error: userError } = await supabase
      .from('users')
      .update({ status: 'inactive' })
      .eq('id', userId);
    if (userError) throw userError;

    return { success: true };
  } catch (error: any) {
    console.error('Error deleting student:', error);
    return { success: false, error: error.message || 'Failed to delete student' };
  }
}

export async function updateStudentCredentials(targetUserId: string, email?: string, newPassword?: string) {
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

export async function getStudentsList() {
  try {
    const { data, error } = await supabase
      .from('students')
      .select(`
        *,
        user:users(*)
      `)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return { success: true, data };
  } catch (error: any) {
    console.error('Error fetching students:', error);
    return { success: false, error: error.message || 'Failed to fetch students list' };
  }
}
