import { supabase } from '@/lib/supabase';
import * as bcrypt from 'bcryptjs';

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
        role: data.role,
        status: 'active',
      })
      .select()
      .single();

    if (userError) throw userError;

    const { data: staffData, error: staffError } = await supabase
      .from('staff')
      .insert({
        user_id: userData.id,
        position: data.position,
        department: data.department,
        date_joined: data.dateJoined,
      })
      .select()
      .single();

    if (staffError) throw staffError;

    return { success: true, data: staffData };
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
