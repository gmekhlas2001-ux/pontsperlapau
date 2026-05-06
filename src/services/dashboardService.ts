import { supabase } from '@/lib/supabase';
import { scopedBranchId } from '@/lib/scope';

export interface DashboardStats {
  totalStaff: number;
  activeStaff: number;
  inactiveStaff: number;
  totalStudents: number;
  activeStudents: number;
  inactiveStudents: number;
  totalClasses: number;
  totalBooks: number;
  availableBooks: number;
  borrowedBooks: number;
  overdueBooks: number;
  totalBranches: number;
  // Academic health
  lowAttendanceCount: number;   // students with attendance_percentage < 80
  failingStudentsCount: number; // students with final grade = 'F'
  gradedEnrollments: number;    // enrollments that have a grade set
}

export interface BranchStat {
  id: string;
  name: string;
  province: string;
  memberCount: number;
  staffCount: number;
  studentCount: number;
}

export async function fetchDashboardStats(): Promise<DashboardStats> {
  const branchId = scopedBranchId();

  const staffQ = supabase.from('staff').select('id, branch_id, user:users!inner(status)').is('deleted_at', null);
  const studentQ = supabase.from('students').select('id, branch_id, user:users!inner(status)').is('deleted_at', null);
  const classQ = supabase.from('classes').select('id', { count: 'exact', head: true });
  const bookQ = supabase.from('books').select('id, branch_id, total_copies, available_copies');
  const branchQ = supabase.from('branches').select('id', { count: 'exact', head: true });
  const overdueQ = supabase
    .from('book_borrowings')
    .select('id, book:books!inner(branch_id)', { count: 'exact', head: true })
    .eq('is_overdue', true)
    .is('returned_date', null);
  // Academic health: pull attendance_percentage + grade from active enrollments
  const enrollQ = supabase
    .from('class_enrollments')
    .select('attendance_percentage, grade, student:students!student_id(branch_id)')
    .eq('status', 'active');

  const [staffResult, studentsResult, classesResult, booksResult, branchesResult, overdueResult, enrollResult] = await Promise.all([
    branchId ? staffQ.eq('branch_id', branchId) : staffQ,
    branchId ? studentQ.eq('branch_id', branchId) : studentQ,
    branchId ? classQ.eq('branch_id', branchId) : classQ,
    branchId ? bookQ.eq('branch_id', branchId) : bookQ,
    branchId ? branchQ.eq('id', branchId) : branchQ,
    branchId ? overdueQ.eq('book.branch_id', branchId) : overdueQ,
    enrollQ,
  ]);

  const staffRows = (staffResult.data ?? []) as unknown as Array<{ user: { status: string } | null }>;
  const activeStaff = staffRows.filter((s) => s.user?.status === 'active').length;

  const studentRows = (studentsResult.data ?? []) as unknown as Array<{ user: { status: string } | null }>;
  const activeStudents = studentRows.filter((s) => s.user?.status === 'active').length;

  const books = (booksResult.data ?? []) as Array<{ total_copies: number; available_copies: number }>;
  const totalBooks = books.reduce((sum, b) => sum + (b.total_copies ?? 0), 0);
  const availableBooks = books.reduce((sum, b) => sum + (b.available_copies ?? 0), 0);
  const borrowedBooks = totalBooks - availableBooks;

  const enrollRows = ((enrollResult.data ?? []) as any[]).filter((e) =>
    !branchId || e.student?.branch_id === branchId
  );
  const lowAttendanceCount = enrollRows.filter((e) =>
    e.attendance_percentage !== null && e.attendance_percentage < 80
  ).length;
  const failingStudentsCount = enrollRows.filter((e) => e.grade === 'F').length;
  const gradedEnrollments = enrollRows.filter((e) => e.grade !== null && e.grade !== '').length;

  return {
    totalStaff: staffRows.length,
    activeStaff,
    inactiveStaff: staffRows.length - activeStaff,
    totalStudents: studentRows.length,
    activeStudents,
    inactiveStudents: studentRows.length - activeStudents,
    totalClasses: classesResult.count ?? 0,
    totalBooks,
    availableBooks,
    borrowedBooks,
    overdueBooks: overdueResult.count ?? 0,
    totalBranches: branchesResult.count ?? 0,
    lowAttendanceCount,
    failingStudentsCount,
    gradedEnrollments,
  };
}

export async function fetchBranchStats(): Promise<BranchStat[]> {
  const branchId = scopedBranchId();

  const branchQ = supabase.from('branches').select('id, name, province').eq('status', 'active').order('name');
  const staffQ = supabase.from('staff').select('id, branch_id');
  const studentQ = supabase.from('students').select('id, branch_id');

  const [branchResult, staffResult, studentResult] = await Promise.all([
    branchId ? branchQ.eq('id', branchId) : branchQ,
    branchId ? staffQ.eq('branch_id', branchId) : staffQ,
    branchId ? studentQ.eq('branch_id', branchId) : studentQ,
  ]);

  const branches = (branchResult.data ?? []) as Array<{ id: string; name: string; province: string }>;
  const staffRows = (staffResult.data ?? []) as Array<{ id: string; branch_id: string | null }>;
  const studentRows = (studentResult.data ?? []) as Array<{ id: string; branch_id: string | null }>;

  return branches.map((branch) => {
    const staffCount = staffRows.filter((s) => s.branch_id === branch.id).length;
    const studentCount = studentRows.filter((s) => s.branch_id === branch.id).length;
    return {
      id: branch.id,
      name: branch.name,
      province: branch.province,
      staffCount,
      studentCount,
      memberCount: staffCount + studentCount,
    };
  });
}
