/**
 * Attendance service.
 *
 * Records and retrieves daily attendance for students enrolled in a class.
 * Each record is keyed by (class_id, student_id, attendance_date) — the DB
 * has a unique constraint on that triple so upsert is safe.
 *
 * `getAttendanceForClass` loads the full roster + any existing records for a
 * given date so the UI can render a pre-filled mark sheet.
 *
 * `updateEnrollmentAttendanceStats` recalculates the running percentage stored
 * on class_enrollments after every save.
 */

import { supabase } from '@/lib/supabase';

export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';

export interface AttendanceRecord {
  id: string;
  class_id: string;
  student_id: string;
  attendance_date: string;
  status: AttendanceStatus;
  notes: string | null;
  recorded_by: string | null;
  created_at: string;
}

export interface AttendanceStudent {
  enrollmentId: string;
  studentId: string;       // students.id
  userId: string;
  studentCode: string;     // students.student_id (STU-0001 etc.)
  firstName: string;
  lastName: string;
  /** Existing record for the selected date, if any */
  record: AttendanceRecord | null;
}

export interface ClassAttendanceSummary {
  classId: string;
  className: string;
  totalSessions: number;
  lastSession: string | null;
}

// ─── Fetch ────────────────────────────────────────────────────────────────────

/**
 * Load enrolled students for a class, merged with their attendance record
 * (if any) for `date`. Returns an array ready for the mark-sheet UI.
 */
export async function getAttendanceForClass(
  classId: string,
  date: string,
): Promise<{ success: boolean; data?: AttendanceStudent[]; error?: string }> {
  try {
    const [enrollRes, recordsRes] = await Promise.all([
      supabase
        .from('class_enrollments')
        .select(`
          id,
          student_id,
          student:students!student_id(
            id,
            student_id,
            user:users!user_id(id, first_name, last_name)
          )
        `)
        .eq('class_id', classId)
        .eq('status', 'active'),
      supabase
        .from('attendance')
        .select('*')
        .eq('class_id', classId)
        .eq('attendance_date', date),
    ]);

    if (enrollRes.error) throw enrollRes.error;

    const records = (recordsRes.data ?? []) as AttendanceRecord[];
    const recordMap = new Map(records.map((r) => [r.student_id, r]));

    const students: AttendanceStudent[] = (enrollRes.data ?? []).map((e: any) => ({
      enrollmentId: e.id,
      studentId: e.student_id,
      userId: e.student?.user?.id ?? '',
      studentCode: e.student?.student_id ?? '',
      firstName: e.student?.user?.first_name ?? '',
      lastName: e.student?.user?.last_name ?? '',
      record: recordMap.get(e.student_id) ?? null,
    }));

    return { success: true, data: students };
  } catch (err: any) {
    return { success: false, error: err.message ?? 'Failed to load attendance' };
  }
}

/**
 * Fetch all attendance records for a class (all dates) — used for the
 * summary / history tab.
 */
export async function getAttendanceHistory(
  classId: string,
): Promise<{ success: boolean; data?: AttendanceRecord[]; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('attendance')
      .select('*')
      .eq('class_id', classId)
      .order('attendance_date', { ascending: false });

    if (error) throw error;
    return { success: true, data: (data ?? []) as AttendanceRecord[] };
  } catch (err: any) {
    return { success: false, error: err.message ?? 'Failed to load history' };
  }
}

/** Unique dates that have at least one attendance record for a class. */
export async function getAttendanceDates(
  classId: string,
): Promise<string[]> {
  const { data } = await supabase
    .from('attendance')
    .select('attendance_date')
    .eq('class_id', classId)
    .order('attendance_date', { ascending: false });

  const unique = new Set((data ?? []).map((r: any) => r.attendance_date as string));
  return Array.from(unique);
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export interface AttendanceEntry {
  studentId: string;   // students.id
  status: AttendanceStatus;
  notes?: string;
}

/**
 * Save a full mark-sheet for one class / one date.
 * Uses upsert so re-saving a date overwrites previous values cleanly.
 * After saving, recalculates attendance_percentage on each enrollment.
 */
export async function saveAttendance(
  classId: string,
  date: string,
  entries: AttendanceEntry[],
): Promise<{ success: boolean; error?: string }> {
  try {
    const storedUser = localStorage.getItem('user');
    const recordedBy = storedUser ? JSON.parse(storedUser).id : null;

    const rows = entries.map((e) => ({
      class_id: classId,
      student_id: e.studentId,
      attendance_date: date,
      status: e.status,
      notes: e.notes ?? null,
      recorded_by: recordedBy,
    }));

    const { error } = await supabase
      .from('attendance')
      .upsert(rows, { onConflict: 'class_id,student_id,attendance_date' });

    if (error) throw error;

    // Recalculate attendance % for each student in this class
    await recalculateAttendanceStats(classId, entries.map((e) => e.studentId));

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message ?? 'Failed to save attendance' };
  }
}

/**
 * Recalculate and persist attendance_percentage on class_enrollments.
 * Called after every save so the value stays accurate.
 */
async function recalculateAttendanceStats(classId: string, studentIds: string[]) {
  for (const studentId of studentIds) {
    const { data: all } = await supabase
      .from('attendance')
      .select('status')
      .eq('class_id', classId)
      .eq('student_id', studentId);

    if (!all || all.length === 0) continue;

    const present = all.filter((r: any) => r.status === 'present' || r.status === 'late').length;
    const pct = Math.round((present / all.length) * 100);

    await supabase
      .from('class_enrollments')
      .update({ attendance_percentage: pct, attendance_count: present })
      .eq('class_id', classId)
      .eq('student_id', studentId);
  }
}
