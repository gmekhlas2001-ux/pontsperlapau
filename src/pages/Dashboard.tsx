import { useEffect, useState } from 'react';
import { Users, UserCheck, BookOpen, Building2, GraduationCap, TrendingUp, Clock, CheckCircle, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface Stats {
  activeStaff: number;
  activeStudents: number;
  totalBranches: number;
  totalBooks: number;
  activeLoans: number;
  pendingApprovals: number;
  returnRequests: number;
}

interface Activity {
  id: string;
  type: 'loan' | 'return_request' | 'approval';
  title: string;
  description: string;
  time: string;
  icon: any;
  color: string;
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
    returnRequests: 0,
  });
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
    loadActivities();
  }, []);

  async function loadStats() {
    try {
      const [staff, students, branches, books, loans, approvals, returnRequests] = await Promise.all([
        supabase.from('staff').select('id', { count: 'exact', head: true }).in('status', ['active', 'approved']),
        supabase.from('students').select('id', { count: 'exact', head: true }).in('status', ['active', 'approved']),
        supabase.from('branches').select('id', { count: 'exact', head: true }),
        supabase.from('books').select('id', { count: 'exact', head: true }),
        supabase.from('book_loans').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('approvals').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('book_loans').select('id', { count: 'exact', head: true }).eq('status', 'return_requested'),
      ]);

      setStats({
        activeStaff: staff.count || 0,
        activeStudents: students.count || 0,
        totalBranches: branches.count || 0,
        totalBooks: books.count || 0,
        activeLoans: loans.count || 0,
        pendingApprovals: approvals.count || 0,
        returnRequests: returnRequests.count || 0,
      });
    } catch (error) {
      console.error('Error loading stats:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadActivities() {
    try {
      const isAdmin = profile?.role_id === 'admin' || profile?.role_id === 'librarian';

      const { data: recentLoans, error: loansError } = await supabase
        .from('book_loans')
        .select('id, status, created_at, books(title), profiles!book_loans_borrower_id_fkey(full_name)')
        .order('created_at', { ascending: false })
        .limit(10);

      if (loansError) throw loansError;

      const activityList: Activity[] = [];

      recentLoans?.forEach(loan => {
        const bookTitle = loan.books?.title || 'Unknown Book';
        const borrowerName = loan.profiles?.full_name || 'Unknown User';
        const timeAgo = getTimeAgo(loan.created_at);

        if (loan.status === 'return_requested') {
          activityList.push({
            id: loan.id,
            type: 'return_request',
            title: 'Book Return Request',
            description: `${borrowerName} wants to return "${bookTitle}"`,
            time: timeAgo,
            icon: AlertCircle,
            color: 'orange',
          });
        } else if (loan.status === 'active') {
          activityList.push({
            id: loan.id,
            type: 'loan',
            title: 'Active Loan',
            description: `${borrowerName} borrowed "${bookTitle}"`,
            time: timeAgo,
            icon: BookOpen,
            color: 'green',
          });
        } else if (loan.status === 'pending') {
          activityList.push({
            id: loan.id,
            type: 'approval',
            title: 'Pending Loan Approval',
            description: `${borrowerName} requested "${bookTitle}"`,
            time: timeAgo,
            icon: Clock,
            color: 'yellow',
          });
        }
      });

      setActivities(activityList.slice(0, 5));
    } catch (error) {
      console.error('Error loading activities:', error);
    }
  }

  function getTimeAgo(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return date.toLocaleDateString();
  }

  const isAdmin = profile?.role_id === 'admin' || profile?.role_id === 'librarian';

  const statCards = [
    { label: 'Active Staff', value: stats.activeStaff, icon: UserCheck, color: 'blue' },
    { label: 'Active Students', value: stats.activeStudents, icon: Users, color: 'emerald' },
    { label: 'Branches', value: stats.totalBranches, icon: Building2, color: 'slate' },
    { label: 'Books', value: stats.totalBooks, icon: BookOpen, color: 'amber' },
    { label: 'Active Loans', value: stats.activeLoans, icon: TrendingUp, color: 'cyan' },
    ...(isAdmin ? [
      { label: 'Return Requests', value: stats.returnRequests, icon: AlertCircle, color: 'orange' },
      { label: 'Pending Approvals', value: stats.pendingApprovals, icon: GraduationCap, color: 'rose' },
    ] : []),
  ];

  const colorClasses: Record<string, { bg: string; text: string; border: string }> = {
    blue: { bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-100' },
    emerald: { bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-100' },
    slate: { bg: 'bg-slate-50', text: 'text-slate-600', border: 'border-slate-100' },
    amber: { bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-100' },
    cyan: { bg: 'bg-cyan-50', text: 'text-cyan-600', border: 'border-cyan-100' },
    orange: { bg: 'bg-orange-50', text: 'text-orange-600', border: 'border-orange-100' },
    rose: { bg: 'bg-rose-50', text: 'text-rose-600', border: 'border-rose-100' },
    green: { bg: 'bg-green-50', text: 'text-green-600', border: 'border-green-100' },
    yellow: { bg: 'bg-yellow-50', text: 'text-yellow-600', border: 'border-yellow-100' },
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
            {isAdmin && stats.returnRequests > 0 && (
              <a
                href="/library"
                className="block p-4 bg-orange-50 border border-orange-200 rounded-xl hover:bg-orange-100 transition-colors"
              >
                <p className="font-medium text-orange-900">Confirm Book Returns</p>
                <p className="text-sm text-orange-600">{stats.returnRequests} book{stats.returnRequests > 1 ? 's' : ''} waiting for return confirmation</p>
              </a>
            )}
            {isAdmin && stats.pendingApprovals > 0 && (
              <a
                href="/approvals"
                className="block p-4 bg-rose-50 border border-rose-200 rounded-xl hover:bg-rose-100 transition-colors"
              >
                <p className="font-medium text-rose-900">Review Pending Approvals</p>
                <p className="text-sm text-rose-600">{stats.pendingApprovals} waiting for review</p>
              </a>
            )}
            {['admin', 'teacher', 'librarian'].includes(profile?.role_id || '') && (
              <>
                <a
                  href="/classrooms"
                  className="block p-4 bg-blue-50 border border-blue-200 rounded-xl hover:bg-blue-100 transition-colors"
                >
                  <p className="font-medium text-blue-900">My Classrooms</p>
                  <p className="text-sm text-blue-600">View and manage your classes</p>
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
            {profile?.role_id === 'student' && (
              <>
                <a
                  href="/classrooms"
                  className="block p-4 bg-blue-50 border border-blue-200 rounded-xl hover:bg-blue-100 transition-colors"
                >
                  <p className="font-medium text-blue-900">My Classrooms</p>
                  <p className="text-sm text-blue-600">View and enroll in classes</p>
                </a>
                <a
                  href="/libraries/books"
                  className="block p-4 bg-emerald-50 border border-emerald-200 rounded-xl hover:bg-emerald-100 transition-colors"
                >
                  <p className="font-medium text-emerald-900">Browse Library</p>
                  <p className="text-sm text-emerald-600">Borrow books and materials</p>
                </a>
              </>
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl p-6 border border-slate-200">
          <h2 className="text-xl font-bold text-slate-900 mb-4">Recent Activity</h2>
          <div className="space-y-3">
            {activities.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-8">No recent activity to display</p>
            ) : (
              activities.map((activity) => {
                const Icon = activity.icon;
                const colors = colorClasses[activity.color];
                return (
                  <div
                    key={activity.id}
                    className="flex items-start gap-3 p-3 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    <div className={`${colors.bg} ${colors.text} p-2 rounded-lg flex-shrink-0`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-900 text-sm">{activity.title}</p>
                      <p className="text-sm text-slate-600 truncate">{activity.description}</p>
                      <p className="text-xs text-slate-400 mt-1">{activity.time}</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
