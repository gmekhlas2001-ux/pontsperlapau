/**
 * Parent Service
 *
 * Manages parent-student links and provides the data a parent needs
 * to view their children's academic information.
 *
 * Data is read-only from the parent's perspective.
 */

import { supabase } from '@/lib/supabase';

export interface ParentStudentLink {
  id: string;
  parentUserId: string;
  studentId: string;
  relationship: string;
  isPrimary: boolean;
  createdAt: string;
  // joined
  studentFirstName: string;
  studentLastName: string;
  studentCode: string;
  studentStatus: string;
  branchName: string | null;
}

export interface ChildSummary {
  studentId: string;
  studentFirstName: string;
  studentLastName: string;
  studentCode: string;
  studentStatus: string;
  branchName: string | null;
  relationship: string;
  isPrimary: boolean;
  // academic snapshot
  enrolledClasses: number;
  averageScore: number | null;
  attendancePct: number | null;
  pendingFeesCount: number;
  pendingFeesAmount: number;
}

// ─── Admin: manage links ───────────────────────────────────────────────────────

export async function getParentLinks(): Promise<{ success: boolean; data?: ParentStudentLink[]; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('parent_student_links')
      .select(`
        id, parent_user_id, student_id, relationship, is_primary, created_at,
        student:students!student_id(
          student_id,
          user:users!user_id(first_name, last_name, status, branch:branches!branch_id(name))
        )
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const rows: ParentStudentLink[] = ((data ?? []) as any[]).map((row) => ({
      id: row.id,
      parentUserId: row.parent_user_id,
      studentId: row.student_id,
      relationship: row.relationship,
      isPrimary: row.is_primary,
      createdAt: row.created_at,
      studentFirstName: row.student?.user?.first_name ?? '',
      studentLastName: row.student?.user?.last_name ?? '',
      studentCode: row.student?.student_id ?? '',
      studentStatus: row.student?.user?.status ?? '',
      branchName: row.student?.user?.branch?.name ?? null,
    }));

    return { success: true, data: rows };
  } catch (err: any) {
    return { success: false, error: err.message ?? 'Failed to load parent links' };
  }
}

export async function createParentLink(data: {
  parentUserId: string;
  studentId: string;
  relationship: string;
  isPrimary: boolean;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.from('parent_student_links').insert({
      parent_user_id: data.parentUserId,
      student_id: data.studentId,
      relationship: data.relationship,
      is_primary: data.isPrimary,
    });
    if (error) throw error;
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message ?? 'Failed to create link' };
  }
}

export async function deleteParentLink(
  linkId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('parent_student_links')
      .delete()
      .eq('id', linkId);
    if (error) throw error;
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message ?? 'Failed to delete link' };
  }
}

// ─── Parent portal: get my children ───────────────────────────────────────────

export async function getMyChildren(
  parentUserId: string,
): Promise<{ success: boolean; data?: ChildSummary[]; error?: string }> {
  try {
    // Get all linked students
    const { data: links, error: linksErr } = await supabase
      .from('parent_student_links')
      .select(`
        student_id, relationship, is_primary,
        student:students!student_id(
          id, student_id,
          user:users!user_id(first_name, last_name, status, branch:branches!branch_id(name))
        )
      `)
      .eq('parent_user_id', parentUserId);

    if (linksErr) throw linksErr;
    if (!links || links.length === 0) return { success: true, data: [] };

    const studentIds = links.map((l: any) => l.student_id);

    // Parallel queries: enrollments, fees
    const [enrollRes, feeRes] = await Promise.all([
      supabase
        .from('class_enrollments')
        .select('student_id, grade, attendance_percentage')
        .in('student_id', studentIds)
        .eq('status', 'active'),
      supabase
        .from('student_fees')
        .select('student_id, amount, status')
        .in('student_id', studentIds)
        .in('status', ['pending', 'overdue', 'partial']),
    ]);

    const enrollments: any[] = enrollRes.data ?? [];
    const pendingFees: any[] = feeRes.data ?? [];

    const children: ChildSummary[] = (links as any[]).map((link) => {
      const sid = link.student_id;
      const s = link.student;
      const myEnrollments = enrollments.filter((e) => e.student_id === sid);
      const myFees = pendingFees.filter((f) => f.student_id === sid);

      const grades = myEnrollments
        .map((e) => parseFloat(e.grade))
        .filter((g) => !isNaN(g));
      const avgGrade = grades.length > 0
        ? grades.reduce((a, b) => a + b, 0) / grades.length
        : null;

      const attPcts = myEnrollments
        .map((e) => parseFloat(e.attendance_percentage))
        .filter((p) => !isNaN(p));
      const avgAtt = attPcts.length > 0
        ? attPcts.reduce((a, b) => a + b, 0) / attPcts.length
        : null;

      return {
        studentId: sid,
        studentFirstName: s?.user?.first_name ?? '',
        studentLastName: s?.user?.last_name ?? '',
        studentCode: s?.student_id ?? '',
        studentStatus: s?.user?.status ?? '',
        branchName: s?.user?.branch?.name ?? null,
        relationship: link.relationship,
        isPrimary: link.is_primary,
        enrolledClasses: myEnrollments.length,
        averageScore: avgGrade !== null ? Math.round(avgGrade * 10) / 10 : null,
        attendancePct: avgAtt !== null ? Math.round(avgAtt * 10) / 10 : null,
        pendingFeesCount: myFees.length,
        pendingFeesAmount: myFees.reduce((s, f) => s + parseFloat(f.amount), 0),
      };
    });

    return { success: true, data: children };
  } catch (err: any) {
    return { success: false, error: err.message ?? 'Failed to load children' };
  }
}
