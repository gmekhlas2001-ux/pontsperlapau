/**
 * Grades service.
 *
 * Manages grade_entries — individual assessment records per student per class.
 * Each entry tracks a score, an optional letter grade, an assessment type
 * (midterm / final / assignment / quiz / project / other), and a date.
 *
 * After any save/delete, `syncFinalGrade` recalculates the weighted average
 * and writes it back to `class_enrollments.grade` so the enrollment row
 * always reflects the current overall standing.
 */

import { supabase } from '@/lib/supabase';

export type AssessmentType = 'midterm' | 'final' | 'assignment' | 'quiz' | 'project' | 'other';

export interface GradeEntry {
  id: string;
  class_id: string;
  student_id: string;
  assessment_name: string;
  assessment_type: AssessmentType;
  score: number | null;
  max_score: number;
  grade_letter: string | null;
  notes: string | null;
  assessment_date: string;
  recorded_by: string | null;
  created_at: string;
}

export interface GradeStudent {
  enrollmentId: string;
  studentId: string;
  userId: string;
  studentCode: string;
  firstName: string;
  lastName: string;
  finalGrade: string | null;       // from class_enrollments.grade
  attendancePct: number;
  entries: GradeEntry[];
  average: number | null;          // computed from entries
}

// ─── Fetch ────────────────────────────────────────────────────────────────────

/** Load all enrolled students for a class with their grade entries. */
export async function getGradesForClass(
  classId: string,
): Promise<{ success: boolean; data?: GradeStudent[]; error?: string }> {
  try {
    const [enrollRes, entriesRes] = await Promise.all([
      supabase
        .from('class_enrollments')
        .select(`
          id,
          student_id,
          grade,
          attendance_percentage,
          student:students!student_id(
            id,
            student_id,
            user:users!user_id(id, first_name, last_name)
          )
        `)
        .eq('class_id', classId)
        .eq('status', 'active'),

      supabase
        .from('grade_entries')
        .select('*')
        .eq('class_id', classId)
        .order('assessment_date', { ascending: false }),
    ]);

    if (enrollRes.error) throw enrollRes.error;

    const entries = (entriesRes.data ?? []) as GradeEntry[];

    const students: GradeStudent[] = (enrollRes.data ?? []).map((e: any) => {
      const studentEntries = entries.filter((g) => g.student_id === e.student_id);
      const scoredEntries = studentEntries.filter((g) => g.score !== null);
      const average =
        scoredEntries.length > 0
          ? Math.round(
              (scoredEntries.reduce((sum, g) => sum + (g.score! / g.max_score) * 100, 0) /
                scoredEntries.length) *
                10,
            ) / 10
          : null;

      return {
        enrollmentId: e.id,
        studentId: e.student_id,
        userId: e.student?.user?.id ?? '',
        studentCode: e.student?.student_id ?? '',
        firstName: e.student?.user?.first_name ?? '',
        lastName: e.student?.user?.last_name ?? '',
        finalGrade: e.grade ?? null,
        attendancePct: e.attendance_percentage ?? 0,
        entries: studentEntries,
        average,
      };
    });

    return { success: true, data: students };
  } catch (err: any) {
    return { success: false, error: err.message ?? 'Failed to load grades' };
  }
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export interface CreateGradeEntryData {
  classId: string;
  studentId: string;
  assessmentName: string;
  assessmentType: AssessmentType;
  score?: number | null;
  maxScore?: number;
  gradeLetter?: string;
  notes?: string;
  assessmentDate?: string;
}

export async function addGradeEntry(
  data: CreateGradeEntryData,
): Promise<{ success: boolean; data?: GradeEntry; error?: string }> {
  try {
    const storedUser = localStorage.getItem('user');
    const recordedBy = storedUser ? JSON.parse(storedUser).id : null;

    const { data: row, error } = await supabase
      .from('grade_entries')
      .insert({
        class_id: data.classId,
        student_id: data.studentId,
        assessment_name: data.assessmentName,
        assessment_type: data.assessmentType,
        score: data.score ?? null,
        max_score: data.maxScore ?? 100,
        grade_letter: data.gradeLetter ?? null,
        notes: data.notes ?? null,
        assessment_date: data.assessmentDate ?? new Date().toISOString().split('T')[0],
        recorded_by: recordedBy,
      })
      .select()
      .single();

    if (error) throw error;
    await syncFinalGrade(data.classId, data.studentId);
    return { success: true, data: row as GradeEntry };
  } catch (err: any) {
    return { success: false, error: err.message ?? 'Failed to add grade' };
  }
}

export async function updateGradeEntry(
  entryId: string,
  updates: Partial<Pick<GradeEntry, 'assessment_name' | 'assessment_type' | 'score' | 'max_score' | 'grade_letter' | 'notes' | 'assessment_date'>>,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: row, error } = await supabase
      .from('grade_entries')
      .update(updates)
      .eq('id', entryId)
      .select('class_id, student_id')
      .single();

    if (error) throw error;
    await syncFinalGrade(row.class_id, row.student_id);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message ?? 'Failed to update grade' };
  }
}

export async function deleteGradeEntry(
  entryId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    // Fetch before delete so we can sync afterwards
    const { data: row } = await supabase
      .from('grade_entries')
      .select('class_id, student_id')
      .eq('id', entryId)
      .single();

    const { error } = await supabase.from('grade_entries').delete().eq('id', entryId);
    if (error) throw error;

    if (row) await syncFinalGrade(row.class_id, row.student_id);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message ?? 'Failed to delete grade' };
  }
}

/** Set the final/overall letter grade on the enrollment row. */
export async function setFinalGrade(
  classId: string,
  studentId: string,
  grade: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('class_enrollments')
      .update({ grade })
      .eq('class_id', classId)
      .eq('student_id', studentId);

    if (error) throw error;
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message ?? 'Failed to set grade' };
  }
}

/**
 * Recalculate the final grade letter from the average and write it to
 * class_enrollments. Skips if there are no scored entries.
 */
async function syncFinalGrade(classId: string, studentId: string) {
  const { data: entries } = await supabase
    .from('grade_entries')
    .select('score, max_score')
    .eq('class_id', classId)
    .eq('student_id', studentId);

  if (!entries || entries.length === 0) return;
  const scored = entries.filter((e: any) => e.score !== null);
  if (scored.length === 0) return;

  const avg =
    (scored.reduce((s: number, e: any) => s + (e.score / e.max_score) * 100, 0) / scored.length);

  // Simple letter-grade mapping
  let letter: string;
  if (avg >= 90) letter = 'A';
  else if (avg >= 80) letter = 'B';
  else if (avg >= 70) letter = 'C';
  else if (avg >= 60) letter = 'D';
  else letter = 'F';

  await supabase
    .from('class_enrollments')
    .update({ grade: letter })
    .eq('class_id', classId)
    .eq('student_id', studentId);
}
