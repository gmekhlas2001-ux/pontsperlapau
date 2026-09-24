import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn() } }));
vi.mock('@/lib/scope', () => ({ getCurrentScope: vi.fn(), scopedBranchId: () => null }));
import { supabase } from '@/lib/supabase';
import { getCurrentScope } from '@/lib/scope';
import { fetchDashboardStats } from './dashboardService';

type Row = Record<string, unknown>;
function database(rows: Record<string, Row[]>, failTable?: string) {
  vi.mocked(supabase.from).mockImplementation(((table: string) => {
    let from = 0; let to = Infinity;
    const query = {
      select() { return query; }, eq() { return query; }, is() { return query; },
      in() { return query; }, lt() { return query; }, or() { return query; }, order() { return query; },
      range(start: number, end: number) { from = start; to = end; return query; },
      returns() { return query; },
      then(resolve: (value: unknown) => unknown) {
        return Promise.resolve({ data: (rows[table] ?? []).slice(from, to + 1), count: (rows[table] ?? []).length, error: table === failTable ? { message: 'Database unavailable' } : null }).then(resolve);
      },
    };
    return query;
  }) as never);
}

describe('dashboard data integrity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentScope).mockReturnValue({ role: 'superadmin', userId: 'me', branchId: null, isGlobal: true, isBranchScoped: false });
  });
  it('includes records beyond the default 1000-row API limit', async () => {
    database({ books: Array.from({ length: 1001 }, (_, id) => ({ id, total_copies: 2, available_copies: 1 })) });
    const stats = await fetchDashboardStats();
    expect(stats.totalBooks).toBe(2002);
    expect(stats.availableBooks).toBe(1001);
  });
  it('surfaces a failed read instead of reporting misleading zero totals', async () => {
    database({}, 'books');
    await expect(fetchDashboardStats()).rejects.toMatchObject({ message: 'Database unavailable' });
  });
  it('counts unread broadcasts once per user and retains separate currency totals', async () => {
    database({
      messages: [{ id: 'read', recipient_id: null, read_at: null }, { id: 'unread', recipient_id: null, read_at: '2026-01-01' }, { id: 'direct', recipient_id: 'me', read_at: null }],
      message_read_receipts: [{ message_id: 'read' }],
      student_fees: [{ amount: '10', currency: 'EUR' }, { amount: '20', currency: 'AFN' }],
    });
    const stats = await fetchDashboardStats();
    expect(stats.unreadMessagesCount).toBe(2);
    expect(stats.outstandingFeesByCurrency).toEqual({ EUR: 10, AFN: 20 });
  });
  it('does not request inaccessible academic or financial resources for a librarian', async () => {
    vi.mocked(getCurrentScope).mockReturnValue({ role: 'librarian', userId: 'me', branchId: null, isGlobal: false, isBranchScoped: true });
    database({});
    await fetchDashboardStats();
    const requested = vi.mocked(supabase.from).mock.calls.map(([table]) => table);
    for (const table of ['students', 'student_fees', 'grants', 'classes', 'class_enrollments']) expect(requested).not.toContain(table);
  });
});
