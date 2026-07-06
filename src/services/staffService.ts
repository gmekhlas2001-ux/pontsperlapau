/**
 * Staff Service
 *
 * Handles all CRUD operations for staff members (admins, teachers, librarians).
 * Staff creation and credential management are delegated to edge functions to
 * ensure password hashing and auth-related logic never runs client-side.
 *
 * Branch scoping is applied automatically — branch-level admins only see
 * staff within their assigned branch.
 */

import { supabase } from '@/lib/supabase';
import { logActivity } from '@/services/activityService';
import { scopedBranchId } from '@/lib/scope';
import { callEdgeFunction } from '@/lib/edge';

// Safe column projection — explicitly excludes password_hash to prevent accidental exposure.
const USER_COLUMNS = `
  id, email, first_name, last_name, father_name, phone_number,
  date_of_birth, gender, role, status, profile_picture_url,
  branch_id, passport_number, last_login, created_at, updated_at
`;

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
  role: 'superadmin' | 'admin' | 'teacher' | 'librarian' | 'parent';
  dateJoined: string;
  branchId?: string;
  bio?: string;
}

/**
 * Create a new staff member via the server-side edge function.
 * The edge function handles password hashing and auth user creation atomically.
 * @returns The created staff role data and the new user ID on success.
 */
export async function createStaff(data: CreateStaffData) {
  const res = await callEdgeFunction('create-user', {
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
  });

  if (!res.ok) return { success: false, error: res.error || 'Failed to create staff member' };
  logActivity({ action_type: 'INSERT', table_name: 'staff', description: `Added staff: ${data.firstName} ${data.lastName}` });
  const payload = res.data as any;
  return {
    success: true,
    data: payload?.roleData,
    userId: payload?.user?.id as string | undefined,
  };
}

export interface UpdateStaffData {
  firstName?: string;
  lastName?: string;
  fatherName?: string;
  phone?: string;
  dateOfBirth?: string;
  gender?: string;
  passportNumber?: string;
  position?: string;
  department?: string;
  role?: 'superadmin' | 'admin' | 'teacher' | 'librarian' | 'parent';
  status?: 'active' | 'inactive';
  dateJoined?: string;
  branchId?: string;
  bio?: string;
}

/**
 * Update an existing staff member's profile and role-specific data.
 * @param staffId - The staff table row ID (for staff-specific fields).
 * @param userId - The user table row ID (for shared user fields like name/email).
 */
export async function updateStaff(staffId: string, userId: string, data: UpdateStaffData) {
  const res = await callEdgeFunction('update-user', {
    targetUserId: userId,
    firstName: data.firstName,
    lastName: data.lastName,
    fatherName: data.fatherName,
    phone: data.phone,
    dateOfBirth: data.dateOfBirth,
    gender: data.gender,
    passportNumber: data.passportNumber,
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
  });

  if (!res.ok) return { success: false, error: res.error || 'Failed to update staff member' };
  logActivity({ action_type: 'UPDATE', table_name: 'staff', description: 'Updated staff member' });
  return { success: true };
}

/** Update email or password for any user. Delegates to edge function for secure hashing. */
export async function updateUserCredentials(targetUserId: string, email?: string, newPassword?: string) {
  const res = await callEdgeFunction('update-user', { targetUserId, email, newPassword });
  if (!res.ok) return { success: false, error: res.error || 'Failed to update credentials' };
  return { success: true };
}

/** Soft-delete a staff member by marking them as deleted server-side. */
export async function deleteStaff(_staffId: string, userId: string) {
  const res = await callEdgeFunction('update-user', { targetUserId: userId, operation: 'delete' });
  if (!res.ok) return { success: false, error: res.error || 'Failed to delete staff member' };
  logActivity({ action_type: 'DELETE', table_name: 'staff', description: 'Removed staff member' });
  return { success: true };
}

/**
 * Fetch all non-deleted staff with their user profile joined.
 * Automatically scoped to the current user's branch when applicable.
 */
export async function getStaffList() {
  try {
    // Determines branch filter based on the logged-in user's scope (null = superadmin, sees all).
    const branchId = scopedBranchId();

    let query = supabase
      .from('staff')
      .select(`*, user:users!user_id(${USER_COLUMNS})`)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (branchId) {
      query = query.eq('branch_id', branchId);
    }

    const { data, error } = await query;
    if (error) throw error;

    // Exclude parent-role users — parents are managed via Parent Links, not Staff
    const filtered = (data ?? []).filter((s: any) => s.user?.role !== 'parent');

    return { success: true, data: filtered };
  } catch (error: any) {
    console.error('Error fetching staff:', error);
    return { success: false, error: error.message || 'Failed to fetch staff list' };
  }
}
