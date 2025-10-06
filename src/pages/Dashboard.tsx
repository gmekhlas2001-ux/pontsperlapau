import { useEffect, useState } from 'react';
import { Users, UserCheck, BookOpen, Building2, GraduationCap, TrendingUp } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface Stats {
  activeStaff: number;
  activeStudents: number;
  totalBranches: number;
  totalBooks: number;
  activeLoans: number;
  pendingApprovals: number;
}

export function Dashboard() {
  const { profile } = useAuth();
  const [stats, setStats] = useState<Stats>({
    activeStaff: 0,
    activeStudents: 0,
    totalBranches: 0,
    totalBooks: 0,
    activeLoans: 0,
    pendingApprovals: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  async function loadStats() {
    try {
      const [staff, students, branches, books, loans, approvals] = await Promise.all([
        supabase.from('staff').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('students').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('branches').select('id', { count: 'exact', head: true }),
        supabase.from('books').select('id', { count: 'exact', head: true }),
        supabase.from('book_loans').select('id', { count: 'exact', head: true }).is('returned_at', null),
        supabase.from('approvals').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      ]);

      setStats({
        activeStaff: staff.count || 0,
        activeStudents: students.count || 0,
        totalBranches: branches.count || 0,
        totalBooks: books.count || 0,
        activeLoans: loans.count || 0,
        pendingApprovals: approvals.count || 0,
      });
    } catch (error) {
      console.error('Error loading stats:', error);
    } finally {
      setLoading(false);
    }
  }

  const statCards = [
    { label: 'Active Staff', value: stats.activeStaff, icon: UserCheck, color: 'blue' },
    { label: 'Active Students', value: stats.activeStudents, icon: Users, color: 'emerald' },
    { label: 'Branches', value: stats.totalBranches, icon: Building2, color: 'purple' },
    { label: 'Books', value: stats.totalBooks, icon: BookOpen, color: 'amber' },
    { label: 'Active Loans', value: stats.activeLoans, icon: TrendingUp, color: 'cyan' },
    { label: 'Pending Approvals', value: stats.pendingApprovals, icon: GraduationCap, color: 'rose' },
  ];

  const colorClasses: Record<string, { bg: string; text: string; border: string }> = {
    blue: { bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-100' },
    emerald: { bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-100' },
    purple: { bg: 'bg-purple-50', text: 'text-purple-600', border: 'border-purple-100' },
    amber: { bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-100' },
    cyan: { bg: 'bg-cyan-50', text: 'text-cyan-600', border: 'border-cyan-100' },
    rose: { bg: 'bg-rose-50', text: 'text-rose-600', border: 'border-rose-100' },
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Dashboard</h1>
        <p className="text-slate-600">
          Welcome back, {profile?.full_name || 'User'}
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-white rounded-2xl p-6 border border-slate-200 animate-pulse">
              <div className="h-20"></div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {statCards.map((card) => {
            const Icon = card.icon;
            const colors = colorClasses[card.color];
            return (
              <div
                key={card.label}
                className={`bg-white rounded-2xl p-6 border ${colors.border} hover:shadow-lg transition-all`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-600 mb-2">{card.label}</p>
                    <p className="text-3xl font-bold text-slate-900">{card.value}</p>
                  </div>
                  <div className={`${colors.bg} ${colors.text} p-3 rounded-xl`}>
                    <Icon className="w-6 h-6" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl p-6 border border-slate-200">
          <h2 className="text-xl font-bold text-slate-900 mb-4">Quick Actions</h2>
          <div className="space-y-3">
            {profile?.role_id === 'admin' && stats.pendingApprovals > 0 && (
              <a
                href="/approvals"
                className="block p-4 bg-rose-50 border border-rose-200 rounded-xl hover:bg-rose-100 transition-colors"
              >
                <p className="font-medium text-rose-900">Review Pending Approvals</p>
                <p className="text-sm text-rose-600">{stats.pendingApprovals} waiting for review</p>
              </a>
            )}
            {['admin', 'staff'].includes(profile?.role_id || '') && (
              <>
                <a
                  href="/students"
                  className="block p-4 bg-blue-50 border border-blue-200 rounded-xl hover:bg-blue-100 transition-colors"
                >
                  <p className="font-medium text-blue-900">Manage Students</p>
                  <p className="text-sm text-blue-600">View and update student records</p>
                </a>
                <a
                  href="/libraries/books"
                  className="block p-4 bg-emerald-50 border border-emerald-200 rounded-xl hover:bg-emerald-100 transition-colors"
                >
                  <p className="font-medium text-emerald-900">Library Management</p>
                  <p className="text-sm text-emerald-600">Manage books, loans, and visits</p>
                </a>
              </>
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl p-6 border border-slate-200">
          <h2 className="text-xl font-bold text-slate-900 mb-4">Recent Activity</h2>
          <div className="space-y-3">
            <p className="text-sm text-slate-500 text-center py-8">No recent activity to display</p>
          </div>
        </div>
      </div>
    </div>
  );
}
