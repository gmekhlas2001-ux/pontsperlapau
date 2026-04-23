import { supabase } from '@/lib/supabase';
import { logActivity } from '@/services/activityService';

export interface CreateStudentData {
  firstName: string;
  lastName: string;
  fatherName?: string;
  dateOfBirth: string;
  gender: 'male' | 'female' | 'other' | 'prefer_not_to_say';
  passportNumber?: string;
  nationality?: string;
  email?: string;
  phone?: string;
  address?: string;
  gradeLevel?: string;
  enrollmentDate: string;
  branchId?: string;
  parentGuardianName?: string;
  parentGuardianEmail?: string;
  parentGuardianPhone?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactRelationship?: string;
  medicalNotes?: string;
  allergies?: string;
}

export interface UpdateStudentData {
  firstName?: string;
  lastName?: string;
  fatherName?: string;
  phone?: string;
  dateOfBirth?: string;
  gender?: string;
  passportNumber?: string;
  nationality?: string;
  address?: string;
  gradeLevel?: string;
  enrollmentDate?: string;
  status?: 'active' | 'inactive';
  branchId?: string;
  parentGuardianName?: string;
  parentGuardianEmail?: string;
  parentGuardianPhone?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactRelationship?: string;
  medicalNotes?: string;
  allergies?: string;
}

export async function createStudent(data: CreateStudentData) {
  try {
    const storedUser = localStorage.getItem('user');
    if (!storedUser) {
      return { success: false, error: 'Not authenticated' };
    }

    const user = JSON.parse(storedUser);
    const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`;

    // Students have no login access — use contact email if provided, otherwise a placeholder
    const email = data.email || `nologin-${crypto.randomUUID()}@students.internal`;
    const password = crypto.randomUUID() + crypto.randomUUID();

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        'X-User-Id': user.id,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        password,
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
          branchId: data.branchId,
          nationality: data.nationality,
          address: data.address,
          parentGuardianName: data.parentGuardianName,
          parentGuardianEmail: data.parentGuardianEmail,
          parentGuardianPhone: data.parentGuardianPhone,
          emergencyContactName: data.emergencyContactName,
          emergencyContactPhone: data.emergencyContactPhone,
          emergencyContactRelationship: data.emergencyContactRelationship,
          medicalNotes: data.medicalNotes,
          allergies: data.allergies,
        },
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      return { success: false, error: result.error || 'Failed to create student' };
    }

    logActivity({ action_type: 'INSERT', table_name: 'students', description: `Enrolled student: ${data.firstName} ${data.lastName}` });
    return { success: true, data: result.roleData };
  } catch (error: any) {
    console.error('Error creating student:', error);
    return { success: false, error: error.message || 'Failed to create student' };
  }
}

export async function updateStudent(studentId: string, userId: string, data: UpdateStudentData) {
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
        dateOfBirth: data.dateOfBirth,
        gender: data.gender,
        passportNumber: data.passportNumber,
        status: data.status,
        studentData: {
          studentId,
          gradeLevel: data.gradeLevel,
          enrollmentDate: data.enrollmentDate,
          branchId: data.branchId,
          nationality: data.nationality,
          address: data.address,
          parentGuardianName: data.parentGuardianName,
          parentGuardianEmail: data.parentGuardianEmail,
          parentGuardianPhone: data.parentGuardianPhone,
          emergencyContactName: data.emergencyContactName,
          emergencyContactPhone: data.emergencyContactPhone,
          emergencyContactRelationship: data.emergencyContactRelationship,
          medicalNotes: data.medicalNotes,
          allergies: data.allergies,
        },
      }),
    });

    const result = await response.json();
    if (!response.ok) return { success: false, error: result.error || 'Failed to update student' };
    logActivity({ action_type: 'UPDATE', table_name: 'students', description: `Updated student record` });
    return { success: true };
  } catch (error: any) {
    console.error('Error updating student:', error);
    return { success: false, error: error.message || 'Failed to update student' };
  }
}

export async function deleteStudent(_studentId: string, userId: string) {
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
    if (!response.ok) return { success: false, error: result.error || 'Failed to delete student' };
    logActivity({ action_type: 'DELETE', table_name: 'students', description: `Removed student record` });
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
