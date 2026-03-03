import { supabase } from '@/lib/supabase';
import * as bcrypt from 'bcryptjs';

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
    const passwordHash = await bcrypt.hash(data.password, 10);

    const { data: userData, error: userError } = await supabase
      .from('users')
      .insert({
        email: data.email,
        password_hash: passwordHash,
        first_name: data.firstName,
        last_name: data.lastName,
        phone_number: data.phone,
        date_of_birth: data.dateOfBirth,
        gender: data.gender,
        role: 'student',
        status: 'active',
      })
      .select()
      .single();

    if (userError) throw userError;

    const { data: studentData, error: studentError } = await supabase
      .from('students')
      .insert({
        user_id: userData.id,
        grade_level: data.gradeLevel,
        enrollment_date: data.enrollmentDate,
      })
      .select()
      .single();

    if (studentError) throw studentError;

    return { success: true, data: studentData };
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
