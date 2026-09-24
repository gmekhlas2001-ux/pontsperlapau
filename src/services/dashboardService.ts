import { supabase } from '@/lib/supabase';
import { getCurrentScope, scopedBranchId } from '@/lib/scope';
import { fetchAllPages } from '@/lib/pagination';

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
  lowAttendanceCount: number;
  failingStudentsCount: number;
  gradedEnrollments: number;
  // Finance
  outstandingFeesCount: number;
  outstandingFeesAmount: number;
  outstandingFeesByCurrency?: Record<string, number>;
  activeGrantsCount: number;
  activeGrantsAmount: number;
  activeGrantsByCurrency?: Record<string, number>;
  // Comms
  unreadMessagesCount: number;
}

export interface BranchStat {
  id: string;
  name: string;
  province: string;
  memberCount: number;
  staffCount: number;
  studentCount: number;
}

type Member = { id: string; branch_id: string; user: { status: string } | null };
type MoneyRow = { amount: number | string; currency: string };
type MessageRow = { id: string; recipient_id: string | null; read_at: string | null };
const queryFor = (table: string, columns: string) => supabase.from(table).select(columns);
type ReadQuery = ReturnType<typeof queryFor>;

function readPages<T>(table: string, columns: string, configure: (query: ReadQuery) => ReadQuery = (q) => q, orderColumn = 'id') {
  return fetchAllPages<T>((from, to) => configure(queryFor(table, columns))
    .order(orderColumn).range(from, to).returns<T[]>());
}

async function readCount(query: PromiseLike<{ count: number | null; error: { message: string } | null }>) {
  const { count, error } = await query;
  if (error) throw new Error(error.message);
  if (count === null) throw new Error('The server did not return a total');
  return count;
}

function moneyTotals(rows: MoneyRow[]) {
  return rows.reduce<Record<string, number>>((totals, row) => {
    const amount = Number(row.amount);
    if (!Number.isFinite(amount)) throw new Error('Invalid amount in dashboard data');
    totals[row.currency] = (totals[row.currency] ?? 0) + amount;
    return totals;
  }, {});
}

export async function fetchDashboardStats(): Promise<DashboardStats> {
  const { role, userId } = getCurrentScope();
  if (!role || !userId) throw new Error('Authentication required');
  const branchId = scopedBranchId();
  const admin = role === 'superadmin' || role === 'admin';
  const academic = admin || role === 'teacher' || role === 'student';
  const finance = admin || role === 'teacher';
  const staff = admin || role === 'teacher' || role === 'librarian';
  const inBranch = (q: ReadQuery) => branchId ? q.eq('branch_id', branchId) : q;

  // Request only resources this role may read. Every growing list is paginated
  // and ordered; a denied or failed read is an error, never an empty total.
  const [members, students, classes, books, branches, overdue, enrollments, fees, grants, messages] = await Promise.all([
    admin ? readPages<Member>('staff', 'id, branch_id, user:users!inner(status)', q => inBranch(q).is('deleted_at', null)) : [],
    academic ? readPages<Member>('students', 'id, branch_id, user:users!inner(status)', q => inBranch(q).is('deleted_at', null)) : [],
    academic ? readCount(inBranch(supabase.from('classes').select('id', { count: 'exact', head: true })).is('deleted_at', null)) : 0,
    readPages<{ total_copies: number; available_copies: number }>('books', 'id, total_copies, available_copies', q => inBranch(q).is('deleted_at', null)),
    readCount(branchId ? supabase.from('branches').select('id', { count: 'exact', head: true }).eq('id', branchId) : supabase.from('branches').select('id', { count: 'exact', head: true })),
    readCount(supabase.from('book_borrowings').select('id', { count: 'exact', head: true }).lt('due_date', new Date().toISOString().slice(0, 10)).is('returned_date', null)),
    academic ? readPages<{ attendance_percentage: number | null; grade: string | null }>('class_enrollments', 'id, attendance_percentage, grade', q => q.eq('status', 'active')) : [],
    finance ? readPages<MoneyRow>('student_fees', 'id, amount, currency', q => inBranch(q).in('status', ['pending', 'overdue', 'partial'])) : [],
    admin ? readPages<MoneyRow>('grants', 'id, amount, currency', q => inBranch(q).eq('status', 'active')) : [],
    staff ? readPages<MessageRow>('messages', 'id, recipient_id, read_at', q => q.is('parent_id', null).or(`recipient_id.eq.${userId},recipient_id.is.null`)) : [],
  ]);
  const receipts = staff && messages.some(m => m.recipient_id === null)
    ? await readPages<{ message_id: string }>('message_read_receipts', 'message_id', q => q.eq('user_id', userId), 'message_id')
    : [];
  const readBroadcasts = new Set(receipts.map(r => r.message_id));
  const activeStaff = members.filter(row => row.user?.status === 'active').length;
  const activeStudents = students.filter(row => row.user?.status === 'active').length;
  const totalBooks = books.reduce((sum, row) => sum + row.total_copies, 0);
  const availableBooks = books.reduce((sum, row) => sum + row.available_copies, 0);
  const outstandingFeesByCurrency = moneyTotals(fees);
  const activeGrantsByCurrency = moneyTotals(grants);
  return {
    totalStaff: members.length, activeStaff, inactiveStaff: members.length - activeStaff,
    totalStudents: students.length, activeStudents, inactiveStudents: students.length - activeStudents,
    totalClasses: classes, totalBooks, availableBooks, borrowedBooks: Math.max(0, totalBooks - availableBooks),
    overdueBooks: overdue, totalBranches: branches,
    lowAttendanceCount: enrollments.filter(e => e.attendance_percentage !== null && e.attendance_percentage < 80).length,
    failingStudentsCount: enrollments.filter(e => e.grade === 'F').length,
    gradedEnrollments: enrollments.filter(e => e.grade).length,
    outstandingFeesCount: fees.length,
    outstandingFeesAmount: Object.values(outstandingFeesByCurrency).reduce((a, b) => a + b, 0),
    outstandingFeesByCurrency,
    activeGrantsCount: grants.length,
    activeGrantsAmount: Object.values(activeGrantsByCurrency).reduce((a, b) => a + b, 0),
    activeGrantsByCurrency,
    unreadMessagesCount: messages.filter(m => m.recipient_id !== null ? m.read_at === null : !readBroadcasts.has(m.id)).length,
  };
}

export async function fetchBranchStats(): Promise<BranchStat[]> {
  const branchId = scopedBranchId();
  const { role } = getCurrentScope();
  if (role !== 'admin' && role !== 'superadmin') return [];
  const inBranch = (q: ReadQuery) => branchId ? q.eq('branch_id', branchId) : q;
  const [branches, members, students] = await Promise.all([
    readPages<{ id: string; name: string; province: string }>('branches', 'id, name, province', q => {
      q = q.eq('status', 'active');
      return branchId ? q.eq('id', branchId) : q;
    }),
    readPages<{ branch_id: string }>('staff', 'id, branch_id', q => inBranch(q).is('deleted_at', null)),
    readPages<{ branch_id: string }>('students', 'id, branch_id', q => inBranch(q).is('deleted_at', null)),
  ]);
  const countByBranch = (rows: { branch_id: string }[]) => rows.reduce<Map<string, number>>((counts, row) => {
    counts.set(row.branch_id, (counts.get(row.branch_id) ?? 0) + 1);
    return counts;
  }, new Map());
  const staffCounts = countByBranch(members);
  const studentCounts = countByBranch(students);
  return branches.sort((a, b) => a.name.localeCompare(b.name)).map(branch => {
    const staffCount = staffCounts.get(branch.id) ?? 0;
    const studentCount = studentCounts.get(branch.id) ?? 0;
    return { ...branch, staffCount, studentCount, memberCount: staffCount + studentCount };
  });
}
