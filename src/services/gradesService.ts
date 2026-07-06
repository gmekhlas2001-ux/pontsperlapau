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
import { callEdgeFunction } from '@/lib/edge';

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
  const res = await callEdgeFunction<{ success: boolean; data: GradeEntry }>('app-actions', {
    operation: 'add-grade-entry',
    classId: data.classId,
    studentId: data.studentId,
    assessmentName: data.assessmentName,
    assessmentType: data.assessmentType,
    score: data.score ?? null,
    maxScore: data.maxScore ?? 100,
    gradeLetter: data.gradeLetter ?? null,
    notes: data.notes ?? null,
    assessmentDate: data.assessmentDate,
  });

  if (!res.ok) return { success: false, error: res.error || 'Failed to add grade' };
  return { success: true, data: res.data?.data };
}

export async function updateGradeEntry(
  entryId: string,
  updates: Partial<Pick<GradeEntry, 'assessment_name' | 'assessment_type' | 'score' | 'max_score' | 'grade_letter' | 'notes' | 'assessment_date'>>,
): Promise<{ success: boolean; error?: string }> {
  const res = await callEdgeFunction('app-actions', {
    operation: 'update-grade-entry',
    entryId,
    updates,
  });

  if (!res.ok) return { success: false, error: res.error || 'Failed to update grade' };
  return { success: true };
}

export async function deleteGradeEntry(
  entryId: string,
): Promise<{ success: boolean; error?: string }> {
  const res = await callEdgeFunction('app-actions', {
    operation: 'delete-grade-entry',
    entryId,
  });

  if (!res.ok) return { success: false, error: res.error || 'Failed to delete grade' };
  return { success: true };
}

/** Set the final/overall letter grade on the enrollment row. */
export async function setFinalGrade(
  classId: string,
  studentId: string,
  grade: string,
): Promise<{ success: boolean; error?: string }> {
  const res = await callEdgeFunction('app-actions', {
    operation: 'set-final-grade',
    classId,
    studentId,
    grade,
  });

  if (!res.ok) return { success: false, error: res.error || 'Failed to set grade' };
  return { success: true };
}
