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
}

export async function fetchDashboardStats(): Promise<DashboardStats> {
  const [staffResult, studentsResult, classesResult, booksResult] = await Promise.all([
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
  };
}
