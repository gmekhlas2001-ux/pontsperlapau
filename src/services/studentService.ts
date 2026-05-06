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
// ─── Profile ──────────────────────────────────────────────────────────────────

export interface StudentProfileClass {
  enrollmentId: string;
  classId: string;
  className: string;
  subject: string | null;
  teacherFirstName: string;
  teacherLastName: string;
  finalGrade: string | null;
  attendancePct: number;
  totalPresent: number;
  totalAbsent: number;
  totalLate: number;
  totalExcused: number;
  gradeEntries: {
    id: string;
    assessmentName: string;
    assessmentType: string;
    score: number | null;
    maxScore: number;
    gradeLetter: string | null;
    assessmentDate: string;
  }[];
  averageScore: number | null;
}

export interface StudentProfileData {
  id: string;
  studentCode: string;
  userId: string;
  firstName: string;
  lastName: string;
  fatherName: string | null;
  email: string | null;
  phone: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  nationality: string | null;
  passportNumber: string | null;
  address: string | null;
  gradeLevel: string | null;
  enrollmentDate: string | null;
  status: string;
  branchId: string | null;
  profilePictureUrl: string | null;
  parentGuardianName: string | null;
  parentGuardianEmail: string | null;
  parentGuardianPhone: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  emergencyContactRelationship: string | null;
  medicalNotes: string | null;
  allergies: string | null;
  createdAt: string;
  classes: StudentProfileClass[];
}

/**
 * Fetch a complete student profile: personal info, class enrollments,
 * per-class grade entries, and per-class attendance breakdown.
 */
export async function getStudentProfile(
  studentId: string,
): Promise<{ success: boolean; data?: StudentProfileData; error?: string }> {
  try {
    const [studentRes, enrollRes, gradeRes, attendRes] = await Promise.all([
      supabase
        .from('students')
        .select(`
          id, student_id, branch_id, grade_level, enrollment_date,
          nationality, address,
          parent_guardian_name, parent_guardian_email, parent_guardian_phone,
          emergency_contact_name, emergency_contact_phone, emergency_contact_relationship,
          medical_notes, allergies, created_at,
          user:users!user_id(
            id, first_name, last_name, father_name, phone_number,
            date_of_birth, gender, status, profile_picture_url,
            email, passport_number
          )
        `)
        .eq('id', studentId)
        .single(),

      supabase
        .from('class_enrollments')
        .select(`
          id, grade, attendance_percentage,
          class:classes!class_id(
            id, name, subject,
            teacher:staff!teacher_id(
              user:users!user_id(first_name, last_name)
            )
          )
        `)
        .eq('student_id', studentId)
        .eq('status', 'active'),

      supabase
        .from('grade_entries')
        .select('id, class_id, assessment_name, assessment_type, score, max_score, grade_letter, assessment_date')
        .eq('student_id', studentId)
        .order('assessment_date', { ascending: false }),

      supabase
        .from('attendance')
        .select('class_id, status')
        .eq('student_id', studentId),
    ]);

    if (studentRes.error) throw studentRes.error;
    const s = studentRes.data as any;
    const u = s.user as any;

    const entries = (gradeRes.data ?? []) as any[];
    const attRecords = (attendRes.data ?? []) as any[];

    const classes: StudentProfileClass[] = ((enrollRes.data ?? []) as any[]).map((e) => {
      const cls = e.class as any;
      const teacher = cls?.teacher?.user as any;
      const classEntries = entries.filter((g) => g.class_id === cls?.id);
      const scored = classEntries.filter((g) => g.score !== null);
      const avg = scored.length > 0
        ? Math.round((scored.reduce((sum: number, g: any) => sum + (g.score / g.max_score) * 100, 0) / scored.length) * 10) / 10
        : null;

      const attForClass = attRecords.filter((r) => r.class_id === cls?.id);
      const countStatus = (st: string) => attForClass.filter((r) => r.status === st).length;

      return {
        enrollmentId: e.id,
        classId: cls?.id ?? '',
        className: cls?.name ?? '',
        subject: cls?.subject ?? null,
        teacherFirstName: teacher?.first_name ?? '',
        teacherLastName: teacher?.last_name ?? '',
        finalGrade: e.grade ?? null,
        attendancePct: e.attendance_percentage ?? 0,
        totalPresent: countStatus('present'),
        totalAbsent: countStatus('absent'),
        totalLate: countStatus('late'),
        totalExcused: countStatus('excused'),
        gradeEntries: classEntries.map((g: any) => ({
          id: g.id,
          assessmentName: g.assessment_name,
          assessmentType: g.assessment_type,
          score: g.score,
          maxScore: g.max_score,
          gradeLetter: g.grade_letter,
          assessmentDate: g.assessment_date,
        })),
        averageScore: avg,
      };
    });

    const profile: StudentProfileData = {
      id: s.id,
      studentCode: s.student_id ?? '',
      userId: u?.id ?? '',
      firstName: u?.first_name ?? '',
      lastName: u?.last_name ?? '',
      fatherName: u?.father_name ?? null,
      email: u?.email ?? null,
      phone: u?.phone_number ?? null,
      dateOfBirth: u?.date_of_birth ?? null,
      gender: u?.gender ?? null,
      nationality: s.nationality ?? null,
      passportNumber: u?.passport_number ?? null,
      address: s.address ?? null,
      gradeLevel: s.grade_level ?? null,
      enrollmentDate: s.enrollment_date ?? null,
      status: u?.status ?? 'active',
      branchId: s.branch_id ?? null,
      profilePictureUrl: u?.profile_picture_url ?? null,
      parentGuardianName: s.parent_guardian_name ?? null,
      parentGuardianEmail: s.parent_guardian_email ?? null,
      parentGuardianPhone: s.parent_guardian_phone ?? null,
      emergencyContactName: s.emergency_contact_name ?? null,
      emergencyContactPhone: s.emergency_contact_phone ?? null,
      emergencyContactRelationship: s.emergency_contact_relationship ?? null,
      medicalNotes: s.medical_notes ?? null,
      allergies: s.allergies ?? null,
      createdAt: s.created_at,
      classes,
    };

    return { success: true, data: profile };
  } catch (err: any) {
    return { success: false, error: err.message ?? 'Failed to load student profile' };
  }
}

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
