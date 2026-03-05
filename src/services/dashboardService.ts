import { supabase } from '@/lib/supabase';

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
  const [staffResult, studentsResult, classesResult, booksResult, branchesResult] = await Promise.all([
    supabase
      .from('staff')
      .select('id, user:users!inner(status)')
      .is('deleted_at', null),
    supabase
      .from('students')
      .select('id, user:users!inner(status)')
      .is('deleted_at', null),
    supabase
      .from('classes')
      .select('id', { count: 'exact', head: true }),
    supabase
      .from('books')
      .select('id, total_copies, available_copies'),
    supabase
      .from('branches')
      .select('id', { count: 'exact', head: true }),
  ]);

  const staffRows = (staffResult.data ?? []) as unknown as Array<{ user: { status: string } | null }>;
  const activeStaff = staffRows.filter((s) => s.user?.status === 'active').length;

  const studentRows = (studentsResult.data ?? []) as unknown as Array<{ user: { status: string } | null }>;
  const activeStudents = studentRows.filter((s) => s.user?.status === 'active').length;

  const books = (booksResult.data ?? []) as Array<{ total_copies: number; available_copies: number }>;
  const totalBooks = books.reduce((sum, b) => sum + (b.total_copies ?? 0), 0);
  const availableBooks = books.reduce((sum, b) => sum + (b.available_copies ?? 0), 0);
  const borrowedBooks = totalBooks - availableBooks;

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
    overdueBooks: 0,
    totalBranches: branchesResult.count ?? 0,
  };
}

export async function fetchBranchStats(): Promise<BranchStat[]> {
  const [branchResult, staffResult, studentResult] = await Promise.all([
    supabase.from('branches').select('id, name, province').eq('status', 'active').order('name'),
    supabase.from('staff').select('id, branch_id'),
    supabase.from('students').select('id, branch_id'),
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
