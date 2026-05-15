import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { StatCard } from '@/components/ui-custom/StatCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { fetchDashboardStats, fetchBranchStats, type DashboardStats, type BranchStat } from '@/services/dashboardService';
import { fetchRecentActivities, type ActivityLog } from '@/services/activityService';
import { hasMissingBranch } from '@/lib/scope';
import { Users, UserCheck, UserX, GraduationCap, BookOpen, Library, Plus, Clock, CircleAlert as AlertCircle, MapPin, ClipboardCheck, CalendarDays, TrendingDown, AlertTriangle, CircleDollarSign, HandCoins, MessageSquare, School } from 'lucide-react';
import i18n from '@/i18n';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

const emptyStats: DashboardStats = {
  totalStaff: 0,
  activeStaff: 0,
  inactiveStaff: 0,
  totalStudents: 0,
  activeStudents: 0,
  inactiveStudents: 0,
  totalClasses: 0,
  totalBooks: 0,
  availableBooks: 0,
  borrowedBooks: 0,
  overdueBooks: 0,
  totalBranches: 0,
  lowAttendanceCount: 0,
  failingStudentsCount: 0,
  gradedEnrollments: 0,
  outstandingFeesCount: 0,
  outstandingFeesAmount: 0,
  activeGrantsCount: 0,
  activeGrantsAmount: 0,
  unreadMessagesCount: 0,
};

export function Dashboard() {
  const { t } = useTranslation();
  const { user, hasPermission } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats>(emptyStats);
  const [branchStats, setBranchStats] = useState<BranchStat[]>([]);
  const [recentActivities, setRecentActivities] = useState<ActivityLog[]>([]);

  useEffect(() => {
    fetchDashboardStats().then(setStats);
    fetchBranchStats().then(setBranchStats);
    fetchRecentActivities(8).then(setRecentActivities);
  }, []);

  const staffData = [
    { name: t('dashboard.activeStaff'), value: stats.activeStaff },
    { name: t('dashboard.inactiveStaff'), value: stats.inactiveStaff },
  ];

  const studentData = [
    { name: t('dashboard.activeStudents'), value: stats.activeStudents },
    { name: t('dashboard.inactiveStudents'), value: stats.inactiveStudents },
  ];

  const libraryData = [
    { name: t('dashboard.availableBooks'), value: stats.availableBooks },
    { name: t('dashboard.borrowedBooks'), value: stats.borrowedBooks },
  ];

  const COLORS = ['#0f9f8f', '#ef4444', '#3b82f6', '#f59e0b'];
  const chartTooltipStyle = {
    border: '1px solid hsl(var(--border))',
    borderRadius: 8,
    background: 'hsl(var(--popover))',
    color: 'hsl(var(--popover-foreground))',
    boxShadow: '0 12px 30px hsl(222 47% 11% / 0.12)',
  };
  const formatNumber = (value: number) => new Intl.NumberFormat(i18n.language).format(value);
  const formatCurrency = (value: number) => new Intl.NumberFormat(undefined, { style: 'currency', currency: 'EUR' }).format(value);
  const actionButtonClass = 'h-11 justify-start border-border/70 bg-card/70 hover:border-primary/30 hover:bg-primary/5';
  const compactActionButtonClass = 'justify-start border-border/70 bg-card/70 hover:border-primary/30 hover:bg-primary/5';
  const todayLabel = new Intl.DateTimeFormat(i18n.language, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  }).format(new Date());

  const renderAdminDashboard = () => (
    <>
      {/* Stats Grid */}
      <div className="motion-list grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Staff card with clickable active/inactive breakdown */}
        <Card className="interactive-card overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t('dashboard.totalStaff')}</CardTitle>
            <div className="rounded-md border border-border/60 bg-primary/10 p-2 text-primary shadow-sm">
              <Users className="h-4 w-4 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight tabular-nums">{formatNumber(stats.totalStaff)}</div>
            <div className="flex items-center gap-2 mt-2">
              <button
                onClick={() => navigate('/staff?status=active')}
                className="flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-400 dark:hover:bg-emerald-900/60"
              >
                <UserCheck className="h-3 w-3" />
                {formatNumber(stats.activeStaff)} {t('common.active').toLowerCase()}
              </button>
              {stats.inactiveStaff > 0 && (
                <button
                  onClick={() => navigate('/staff?status=inactive')}
                  className="flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-200 dark:bg-red-900/40 dark:text-red-400 dark:hover:bg-red-900/60"
                >
                  <UserX className="h-3 w-3" />
                  {formatNumber(stats.inactiveStaff)} {t('common.inactive').toLowerCase()}
                </button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Students card with clickable active/inactive breakdown */}
        <Card className="interactive-card overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t('dashboard.totalStudents')}</CardTitle>
            <div className="rounded-md border border-border/60 bg-primary/10 p-2 text-primary shadow-sm">
              <GraduationCap className="h-4 w-4 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight tabular-nums">{formatNumber(stats.totalStudents)}</div>
            <div className="flex items-center gap-2 mt-2">
              <button
                onClick={() => navigate('/students?status=active')}
                className="flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-400 dark:hover:bg-emerald-900/60"
              >
                <UserCheck className="h-3 w-3" />
                {formatNumber(stats.activeStudents)} {t('common.active').toLowerCase()}
              </button>
              {stats.inactiveStudents > 0 && (
                <button
                  onClick={() => navigate('/students?status=inactive')}
                  className="flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-200 dark:bg-red-900/40 dark:text-red-400 dark:hover:bg-red-900/60"
                >
                  <UserX className="h-3 w-3" />
                  {formatNumber(stats.inactiveStudents)} {t('common.inactive').toLowerCase()}
                </button>
              )}
            </div>
          </CardContent>
        </Card>

        <StatCard
          title={t('dashboard.totalClasses')}
          value={stats.totalClasses}
          icon={BookOpen}
        />
        <StatCard
          title={t('dashboard.totalBooks')}
          value={stats.totalBooks}
          description={`${stats.availableBooks} ${t('dashboard.availableBooks')}`}
          icon={Library}
        />
      </div>

      {/* Academic health alerts */}
      {(stats.lowAttendanceCount > 0 || stats.failingStudentsCount > 0) && (
        <div className="motion-list grid gap-3 sm:grid-cols-2">
          {stats.lowAttendanceCount > 0 && (
            <button
              onClick={() => navigate('/attendance')}
              className="interactive-card flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-left shadow-sm transition-colors hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-900/20 dark:hover:bg-amber-900/30"
            >
              <div className="flex-shrink-0 rounded-md bg-amber-100 p-2 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400">
                <TrendingDown className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-amber-800 dark:text-amber-300 text-sm">
                  {formatNumber(stats.lowAttendanceCount)} student{stats.lowAttendanceCount !== 1 ? 's' : ''} with low attendance
                </p>
                <p className="text-xs text-amber-600 dark:text-amber-500 mt-0.5">Below 80% - click to review</p>
              </div>
            </button>
          )}
          {stats.failingStudentsCount > 0 && (
            <button
              onClick={() => navigate('/grades')}
              className="interactive-card flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-left shadow-sm transition-colors hover:bg-red-100 dark:border-red-800 dark:bg-red-900/20 dark:hover:bg-red-900/30"
            >
              <div className="flex-shrink-0 rounded-md bg-red-100 p-2 text-red-600 dark:bg-red-900/40 dark:text-red-400">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-red-800 dark:text-red-300 text-sm">
                  {formatNumber(stats.failingStudentsCount)} student{stats.failingStudentsCount !== 1 ? 's' : ''} with failing grade
                </p>
                <p className="text-xs text-red-600 dark:text-red-500 mt-0.5">Grade F - click to review</p>
              </div>
            </button>
          )}
        </div>
      )}

      {/* Finance & comms alerts */}
      {(stats.outstandingFeesCount > 0 || stats.activeGrantsCount > 0 || stats.unreadMessagesCount > 0) && (
        <div className="motion-list grid gap-3 sm:grid-cols-3">
          {stats.outstandingFeesCount > 0 && (
            <button
              onClick={() => navigate('/fees')}
              className="interactive-card flex items-center gap-3 rounded-lg border border-orange-200 bg-orange-50 p-4 text-left shadow-sm transition-colors hover:bg-orange-100 dark:border-orange-800 dark:bg-orange-900/20 dark:hover:bg-orange-900/30"
            >
              <div className="flex-shrink-0 rounded-md bg-orange-100 p-2 text-orange-600 dark:bg-orange-900/40 dark:text-orange-400">
                <CircleDollarSign className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-orange-800 dark:text-orange-300 text-sm">
                  {formatCurrency(stats.outstandingFeesAmount)} outstanding
                </p>
                <p className="text-xs text-orange-600 dark:text-orange-500 mt-0.5">{formatNumber(stats.outstandingFeesCount)} unpaid fee{stats.outstandingFeesCount !== 1 ? 's' : ''}</p>
              </div>
            </button>
          )}
          {stats.activeGrantsCount > 0 && (
            <button
              onClick={() => navigate('/donors')}
              className="interactive-card flex items-center gap-3 rounded-lg border border-teal-200 bg-teal-50 p-4 text-left shadow-sm transition-colors hover:bg-teal-100 dark:border-teal-800 dark:bg-teal-900/20 dark:hover:bg-teal-900/30"
            >
              <div className="flex-shrink-0 rounded-md bg-teal-100 p-2 text-teal-600 dark:bg-teal-900/40 dark:text-teal-400">
                <HandCoins className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-teal-800 dark:text-teal-300 text-sm">
                  {formatCurrency(stats.activeGrantsAmount)} in grants
                </p>
                <p className="text-xs text-teal-600 dark:text-teal-500 mt-0.5">{formatNumber(stats.activeGrantsCount)} active grant{stats.activeGrantsCount !== 1 ? 's' : ''}</p>
              </div>
            </button>
          )}
          {stats.unreadMessagesCount > 0 && (
            <button
              onClick={() => navigate('/messages')}
              className="interactive-card flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 text-left shadow-sm transition-colors hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-900/20 dark:hover:bg-blue-900/30"
            >
              <div className="flex-shrink-0 rounded-md bg-blue-100 p-2 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400">
                <MessageSquare className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-blue-800 dark:text-blue-300 text-sm">
                  {formatNumber(stats.unreadMessagesCount)} unread message{stats.unreadMessagesCount !== 1 ? 's' : ''}
                </p>
                <p className="text-xs text-blue-600 dark:text-blue-500 mt-0.5">Click to open inbox</p>
              </div>
            </button>
          )}
        </div>
      )}

      {/* Charts */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card className="interactive-card">
          <CardHeader>
            <CardTitle className="text-sm font-medium">{t('dashboard.activeStaff')} vs {t('dashboard.inactiveStaff')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={staffData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                  stroke="hsl(var(--card))"
                  strokeWidth={3}
                >
                  {staffData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={chartTooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="interactive-card">
          <CardHeader>
            <CardTitle className="text-sm font-medium">{t('dashboard.activeStudents')} vs {t('dashboard.inactiveStudents')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={studentData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                  stroke="hsl(var(--card))"
                  strokeWidth={3}
                >
                  {studentData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={chartTooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="interactive-card">
          <CardHeader>
            <CardTitle className="text-sm font-medium">{t('dashboard.libraryStatus')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={libraryData}>
                <CartesianGrid strokeDasharray="4 4" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip contentStyle={chartTooltipStyle} />
                <Bar dataKey="value" fill="#3b82f6" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Branch Overview */}
      {branchStats.length > 0 && (
        <Card className="interactive-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              Branches Overview
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {branchStats.map((branch) => (
                <div
                  key={branch.id}
                  className="flex items-center justify-between rounded-md border border-border/70 bg-muted/35 p-3 transition-colors hover:border-primary/25 hover:bg-accent/50"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{branch.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{branch.province}</p>
                  </div>
                  <div className="text-right ml-3 flex-shrink-0">
                    <p className="font-semibold text-sm tabular-nums">{formatNumber(branch.memberCount)}</p>
                    <p className="text-xs text-muted-foreground">members</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Activity & Quick Actions */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="interactive-card">
          <CardHeader>
            <CardTitle>{t('dashboard.recentActivity')}</CardTitle>
          </CardHeader>
          <CardContent>
            {recentActivities.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('common.noData')}</p>
            ) : (
              <div className="motion-list space-y-2">
                {recentActivities.map((activity) => (
                  <div key={activity.id} className="flex items-start gap-3 rounded-md border border-transparent p-2 transition-colors hover:border-border/70 hover:bg-muted/45">
                    <div className={`mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-xs font-semibold
                      ${activity.action_type === 'INSERT' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400' : ''}
                      ${activity.action_type === 'UPDATE' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400' : ''}
                      ${activity.action_type === 'DELETE' ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400' : ''}
                    `}>
                      {activity.action_type === 'INSERT' ? '+' : activity.action_type === 'DELETE' ? '−' : '~'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium leading-snug">{activity.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(activity.created_at).toLocaleString(i18n.language)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="interactive-card">
          <CardHeader>
            <CardTitle>{t('dashboard.quickActions')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              <Button variant="outline" className={actionButtonClass} onClick={() => navigate('/staff')}>
                <Plus className="mr-2 h-4 w-4" />
                {t('staff.addStaff')}
              </Button>
              <Button variant="outline" className={actionButtonClass} onClick={() => navigate('/students')}>
                <Plus className="mr-2 h-4 w-4" />
                {t('students.addStudent')}
              </Button>
              <Button variant="outline" className={actionButtonClass} onClick={() => navigate('/classes')}>
                <Plus className="mr-2 h-4 w-4" />
                {t('classes.addClass')}
              </Button>
              <Button variant="outline" className={actionButtonClass} onClick={() => navigate('/library')}>
                <Plus className="mr-2 h-4 w-4" />
                {t('library.addBook')}
              </Button>
              <Button variant="outline" className={actionButtonClass} onClick={() => navigate('/attendance')}>
                <ClipboardCheck className="mr-2 h-4 w-4" />
                Attendance
              </Button>
              <Button variant="outline" className={actionButtonClass} onClick={() => navigate('/timetable')}>
                <CalendarDays className="mr-2 h-4 w-4" />
                Timetable
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );

  const renderTeacherDashboard = () => (
    <>
      <div className="motion-list grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <StatCard
          title={t('dashboard.totalStudents')}
          value={stats.totalStudents}
          icon={GraduationCap}
        />
        <StatCard
          title={t('dashboard.totalClasses')}
          value={stats.totalClasses}
          icon={BookOpen}
        />
        <StatCard
          title={t('dashboard.totalBooks')}
          value={stats.totalBooks}
          description={`${stats.availableBooks} ${t('dashboard.availableBooks')}`}
          icon={Library}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="interactive-card">
          <CardHeader>
            <CardTitle>{t('dashboard.recentActivity')}</CardTitle>
          </CardHeader>
          <CardContent>
            {recentActivities.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('common.noData')}</p>
            ) : (
              <div className="motion-list space-y-2">
                {recentActivities.slice(0, 5).map((activity) => (
                  <div key={activity.id} className="flex items-start gap-3 rounded-md border border-transparent p-2 transition-colors hover:border-border/70 hover:bg-muted/45">
                    <div className={`mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-xs font-semibold
                      ${activity.action_type === 'INSERT' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400' : ''}
                      ${activity.action_type === 'UPDATE' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400' : ''}
                      ${activity.action_type === 'DELETE' ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400' : ''}
                    `}>
                      {activity.action_type === 'INSERT' ? '+' : activity.action_type === 'DELETE' ? '−' : '~'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium leading-snug">{activity.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(activity.created_at).toLocaleString(i18n.language)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="interactive-card">
          <CardHeader>
            <CardTitle>{t('dashboard.quickActions')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-3">
              <Button variant="outline" className={compactActionButtonClass} onClick={() => navigate('/classes')}>
                <BookOpen className="mr-2 h-4 w-4" />
                {t('classes.title')}
              </Button>
              <Button variant="outline" className={compactActionButtonClass} onClick={() => navigate('/students')}>
                <GraduationCap className="mr-2 h-4 w-4" />
                {t('nav.students')}
              </Button>
              <Button variant="outline" className={compactActionButtonClass} onClick={() => navigate('/library')}>
                <Library className="mr-2 h-4 w-4" />
                {t('nav.library')}
              </Button>
              <Button variant="outline" className={compactActionButtonClass} onClick={() => navigate('/attendance')}>
                <ClipboardCheck className="mr-2 h-4 w-4" />
                Attendance
              </Button>
              <Button variant="outline" className={compactActionButtonClass} onClick={() => navigate('/timetable')}>
                <CalendarDays className="mr-2 h-4 w-4" />
                Timetable
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );

  const renderLibrarianDashboard = () => (
    <>
      <div className="motion-list grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title={t('dashboard.totalBooks')}
          value={stats.totalBooks}
          icon={Library}
        />
        <StatCard
          title={t('dashboard.availableBooks')}
          value={stats.availableBooks}
          icon={BookOpen}
        />
        <StatCard
          title={t('dashboard.borrowedBooks')}
          value={stats.borrowedBooks}
          icon={UserCheck}
        />
        <StatCard
          title={t('dashboard.overdueBooks')}
          value={stats.overdueBooks}
          icon={AlertCircle}
          iconClassName="bg-red-500/15 text-red-600 dark:bg-red-500/20 dark:text-red-400"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="interactive-card">
          <CardHeader>
            <CardTitle>{t('library.borrowedBooks')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
              <BookOpen className="h-8 w-8 mb-2 opacity-40" />
              <p className="text-sm font-medium">{stats.borrowedBooks} {t('dashboard.borrowedBooks').toLowerCase()}</p>
              <Button variant="outline" size="sm" className="mt-3 border-border/70 bg-card/70 hover:border-primary/30 hover:bg-primary/5" onClick={() => navigate('/library')}>
                {t('common.view')} {t('nav.library')}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="interactive-card">
          <CardHeader>
            <CardTitle>{t('dashboard.quickActions')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-3">
              <Button variant="outline" className={compactActionButtonClass} onClick={() => navigate('/library')}>
                <Plus className="mr-2 h-4 w-4" />
                {t('library.addBook')}
              </Button>
              <Button variant="outline" className={compactActionButtonClass} onClick={() => navigate('/library')}>
                <UserCheck className="mr-2 h-4 w-4" />
                {t('library.lendBook')}
              </Button>
              <Button variant="outline" className={compactActionButtonClass} onClick={() => navigate('/library')}>
                <BookOpen className="mr-2 h-4 w-4" />
                {t('library.returnBook')}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );

  const renderStudentDashboard = () => (
    <>
      <div className="motion-list grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <StatCard
          title={t('dashboard.totalClasses')}
          value={stats.totalClasses}
          icon={BookOpen}
        />
        <StatCard
          title={t('dashboard.totalBooks')}
          value={stats.totalBooks}
          description={`${stats.availableBooks} ${t('dashboard.availableBooks')}`}
          icon={Library}
        />
        <StatCard
          title={t('dashboard.borrowedBooks')}
          value={stats.borrowedBooks}
          icon={Clock}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="interactive-card">
          <CardHeader>
            <CardTitle>{t('nav.classes')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
              <BookOpen className="h-8 w-8 mb-2 opacity-40" />
              <p className="text-sm">{t('classes.classList')}</p>
              <Button variant="outline" size="sm" className="mt-3 border-border/70 bg-card/70 hover:border-primary/30 hover:bg-primary/5" onClick={() => navigate('/classes')}>
                {t('common.view')} {t('nav.classes')}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="interactive-card">
          <CardHeader>
            <CardTitle>{t('nav.library')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
              <Library className="h-8 w-8 mb-2 opacity-40" />
              <p className="text-sm">{t('library.bookList')}</p>
              <Button variant="outline" size="sm" className="mt-3 border-border/70 bg-card/70 hover:border-primary/30 hover:bg-primary/5" onClick={() => navigate('/library')}>
                {t('common.view')} {t('nav.library')}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Student quick actions */}
      <div className="motion-list grid gap-3 sm:grid-cols-3">
        <Button variant="outline" className="h-auto justify-start border-border/70 bg-card/70 py-3 hover:border-primary/30 hover:bg-primary/5" onClick={() => navigate('/my-profile')}>
          <GraduationCap className="mr-2 h-4 w-4 text-teal-600" />
          <div className="text-left">
            <p className="font-medium text-sm">My Grades</p>
            <p className="text-xs text-muted-foreground">View assessments & report card</p>
          </div>
        </Button>
        <Button variant="outline" className="h-auto justify-start border-border/70 bg-card/70 py-3 hover:border-primary/30 hover:bg-primary/5" onClick={() => navigate('/timetable')}>
          <CalendarDays className="mr-2 h-4 w-4 text-blue-600" />
          <div className="text-left">
            <p className="font-medium text-sm">Timetable</p>
            <p className="text-xs text-muted-foreground">Weekly class schedule</p>
          </div>
        </Button>
        <Button variant="outline" className="h-auto justify-start border-border/70 bg-card/70 py-3 hover:border-primary/30 hover:bg-primary/5" onClick={() => navigate('/library')}>
          <BookOpen className="mr-2 h-4 w-4 text-violet-600" />
          <div className="text-left">
            <p className="font-medium text-sm">Library</p>
            <p className="text-xs text-muted-foreground">Browse available books</p>
          </div>
        </Button>
      </div>
    </>
  );

  return (
    <div className="space-y-6">
      <section className="dashboard-command overflow-hidden rounded-lg border border-border/70 px-4 py-5 sm:px-6">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground">
              {user?.role && (
                <span className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-card/70 px-2.5 py-1 shadow-sm">
                  <School className="h-3.5 w-3.5 text-primary" />
                  {t(`roles.${user.role}`)}
                </span>
              )}
              <span className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-card/70 px-2.5 py-1 shadow-sm">
                <CalendarDays className="h-3.5 w-3.5 text-primary" />
                {todayLabel}
              </span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              {t('dashboard.welcome')}, {user?.firstName}!
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground sm:text-base">
              {t('dashboard.title')}
            </p>
          </div>

          <div className="grid min-w-[min(100%,24rem)] grid-cols-3 gap-2">
            <div className="rounded-md border border-border/70 bg-card/75 p-3 shadow-sm">
              <p className="text-lg font-bold tabular-nums">{formatNumber(stats.totalStudents)}</p>
              <p className="truncate text-xs text-muted-foreground">{t('nav.students')}</p>
            </div>
            <div className="rounded-md border border-border/70 bg-card/75 p-3 shadow-sm">
              <p className="text-lg font-bold tabular-nums">{formatNumber(stats.totalClasses)}</p>
              <p className="truncate text-xs text-muted-foreground">{t('nav.classes')}</p>
            </div>
            <div className="rounded-md border border-border/70 bg-card/75 p-3 shadow-sm">
              <p className="text-lg font-bold tabular-nums">{formatNumber(stats.totalBooks)}</p>
              <p className="truncate text-xs text-muted-foreground">{t('nav.library')}</p>
            </div>
          </div>
        </div>
      </section>

      {hasMissingBranch() && (
        <div className="interactive-card flex items-start gap-3 rounded-lg border border-red-300 bg-red-50 p-4 shadow-sm dark:border-red-800 dark:bg-red-900/20">
          <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="font-semibold text-red-800 dark:text-red-300 text-sm">
              No branch assigned to your account
            </p>
            <p className="text-xs text-red-600 dark:text-red-500 mt-1">
              You won't see any branch-scoped data (students, fees, classes, etc.) until a superadmin assigns you to a branch. Ask a superadmin to update your account in Staff &rarr; Edit.
            </p>
          </div>
        </div>
      )}

      {hasPermission(['superadmin', 'admin']) && renderAdminDashboard()}
      {user?.role === 'teacher' && renderTeacherDashboard()}
      {user?.role === 'librarian' && renderLibrarianDashboard()}
      {user?.role === 'student' && renderStudentDashboard()}
    </div>
  );
}
