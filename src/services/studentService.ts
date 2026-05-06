/**
 * Student Service
 *
 * Manages student lifecycle: enrollment, profile updates, and removal.
 * Students do not have login credentials by design — the system generates a
 * synthetic email and unguessable password to satisfy the auth schema while
 * preventing direct student access. This keeps the auth table uniform without
 * introducing a separate identity model.
 *
 * All queries respect branch scoping for multi-tenant isolation.
 */

import { supabase } from '@/lib/supabase';
import { logActivity } from '@/services/activityService';
import { scopedBranchId } from '@/lib/scope';
import { callEdgeFunction } from '@/lib/edge';

// Safe column projection — explicitly excludes password_hash.
const USER_COLUMNS = `
  id, email, first_name, last_name, father_name, phone_number,
  date_of_birth, gender, role, status, profile_picture_url,
  branch_id, passport_number, last_login, created_at, updated_at
`;

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

/**
 * Enroll a new student. Creates an auth user with a non-functional synthetic email
 * and cryptographically random password so the student row satisfies foreign-key
 * constraints without granting login access.
 */
export async function createStudent(data: CreateStudentData) {
  // Synthetic credentials — ensures a valid auth row exists without enabling login.
  const email = data.email || `nologin-${crypto.randomUUID()}@students.internal`;
  const password = crypto.randomUUID() + crypto.randomUUID();

  const res = await callEdgeFunction('create-user', {
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
  });

  if (!res.ok) return { success: false, error: res.error || 'Failed to create student' };
  logActivity({ action_type: 'INSERT', table_name: 'students', description: `Enrolled student: ${data.firstName} ${data.lastName}` });
  const payload = res.data as any;
  return {
    success: true,
    data: payload?.roleData,
    userId: payload?.user?.id as string | undefined,
  };
}

/**
 * Update a student's personal and academic information.
 * @param studentId - The students table row ID.
 * @param userId - The associated user table row ID.
 */
export async function updateStudent(studentId: string, userId: string, data: UpdateStudentData) {
  const res = await callEdgeFunction('update-user', {
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
  });

  if (!res.ok) return { success: false, error: res.error || 'Failed to update student' };
  logActivity({ action_type: 'UPDATE', table_name: 'students', description: 'Updated student record' });
  return { success: true };
}

/** Soft-delete a student record via the edge function. */
export async function deleteStudent(_studentId: string, userId: string) {
  const res = await callEdgeFunction('update-user', { targetUserId: userId, operation: 'delete' });
  if (!res.ok) return { success: false, error: res.error || 'Failed to delete student' };
  logActivity({ action_type: 'DELETE', table_name: 'students', description: 'Removed student record' });
  return { success: true };
}

/** Update login credentials for a student (used when portal access is enabled). */
export async function updateStudentCredentials(targetUserId: string, email?: string, newPassword?: string) {
  const res = await callEdgeFunction('update-user', { targetUserId, email, newPassword });
  if (!res.ok) return { success: false, error: res.error || 'Failed to update credentials' };
  return { success: true };
}

/**
 * Retrieve all active students with their user profiles.
 * Branch-scoped automatically for non-superadmin users.
 */
export async function getStudentsList() {
  try {
    const branchId = scopedBranchId();

    let query = supabase
      .from('students')
      .select(`*, user:users!user_id(${USER_COLUMNS})`)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (branchId) {
      query = query.eq('branch_id', branchId);
    }

    const { data, error } = await query;
    if (error) throw error;

    return { success: true, data };
  } catch (error: any) {
    console.error('Error fetching students:', error);
    return { success: false, error: error.message || 'Failed to fetch students list' };
  }
}
