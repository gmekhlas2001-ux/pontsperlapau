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
