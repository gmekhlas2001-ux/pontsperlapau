import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { StatCard } from '@/components/ui-custom/StatCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { fetchDashboardStats, fetchBranchStats, type DashboardStats, type BranchStat } from '@/services/dashboardService';
import { fetchRecentActivities, type ActivityLog } from '@/services/activityService';
import { Users, UserCheck, UserX, GraduationCap, BookOpen, Library, Plus, Clock, CircleAlert as AlertCircle, MapPin, ClipboardCheck, CalendarDays, TrendingDown, AlertTriangle, CircleDollarSign, HandCoins, MessageSquare } from 'lucide-react';
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

  const COLORS = ['#10b981', '#ef4444', '#3b82f6', '#f59e0b'];

  const renderAdminDashboard = () => (
    <>
      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Staff card with clickable active/inactive breakdown */}
        <Card className="overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t('dashboard.totalStaff')}</CardTitle>
            <div className="p-2 rounded-lg bg-primary/10">
              <Users className="h-4 w-4 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalStaff}</div>
            <div className="flex items-center gap-2 mt-2">
              <button
                onClick={() => navigate('/staff?status=active')}
                className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-400 dark:hover:bg-emerald-900/60 transition-colors"
              >
                <UserCheck className="h-3 w-3" />
                {stats.activeStaff} active
              </button>
              {stats.inactiveStaff > 0 && (
                <button
                  onClick={() => navigate('/staff?status=inactive')}
                  className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-600 hover:bg-red-200 dark:bg-red-900/40 dark:text-red-400 dark:hover:bg-red-900/60 transition-colors"
                >
                  <UserX className="h-3 w-3" />
                  {stats.inactiveStaff} inactive
                </button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Students card with clickable active/inactive breakdown */}
        <Card className="overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t('dashboard.totalStudents')}</CardTitle>
            <div className="p-2 rounded-lg bg-primary/10">
              <GraduationCap className="h-4 w-4 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalStudents}</div>
            <div className="flex items-center gap-2 mt-2">
              <button
                onClick={() => navigate('/students?status=active')}
                className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-400 dark:hover:bg-emerald-900/60 transition-colors"
              >
                <UserCheck className="h-3 w-3" />
                {stats.activeStudents} active
              </button>
              {stats.inactiveStudents > 0 && (
                <button
                  onClick={() => navigate('/students?status=inactive')}
                  className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-600 hover:bg-red-200 dark:bg-red-900/40 dark:text-red-400 dark:hover:bg-red-900/60 transition-colors"
                >
                  <UserX className="h-3 w-3" />
                  {stats.inactiveStudents} inactive
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
        <div className="grid gap-3 sm:grid-cols-2">
          {stats.lowAttendanceCount > 0 && (
            <button
              onClick={() => navigate('/attendance')}
              className="flex items-center gap-3 p-4 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors text-left"
            >
              <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 flex-shrink-0">
                <TrendingDown className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-amber-800 dark:text-amber-300 text-sm">
                  {stats.lowAttendanceCount} student{stats.lowAttendanceCount !== 1 ? 's' : ''} with low attendance
                </p>
                <p className="text-xs text-amber-600 dark:text-amber-500 mt-0.5">Below 80% — click to review</p>
              </div>
            </button>
          )}
          {stats.failingStudentsCount > 0 && (
            <button
              onClick={() => navigate('/grades')}
              className="flex items-center gap-3 p-4 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors text-left"
            >
              <div className="p-2 rounded-lg bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 flex-shrink-0">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-red-800 dark:text-red-300 text-sm">
                  {stats.failingStudentsCount} student{stats.failingStudentsCount !== 1 ? 's' : ''} with failing grade
                </p>
                <p className="text-xs text-red-600 dark:text-red-500 mt-0.5">Grade F — click to review</p>
              </div>
            </button>
          )}
        </div>
      )}

      {/* Finance & comms alerts */}
      {(stats.outstandingFeesCount > 0 || stats.activeGrantsCount > 0 || stats.unreadMessagesCount > 0) && (
        <div className="grid gap-3 sm:grid-cols-3">
          {stats.outstandingFeesCount > 0 && (
            <button
              onClick={() => navigate('/fees')}
              className="flex items-center gap-3 p-4 rounded-xl border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/20 hover:bg-orange-100 dark:hover:bg-orange-900/30 transition-colors text-left"
            >
              <div className="p-2 rounded-lg bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400 flex-shrink-0">
                <CircleDollarSign className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-orange-800 dark:text-orange-300 text-sm">
                  {new Intl.NumberFormat(undefined, { style: 'currency', currency: 'EUR' }).format(stats.outstandingFeesAmount)} outstanding
                </p>
                <p className="text-xs text-orange-600 dark:text-orange-500 mt-0.5">{stats.outstandingFeesCount} unpaid fee{stats.outstandingFeesCount !== 1 ? 's' : ''}</p>
              </div>
            </button>
          )}
          {stats.activeGrantsCount > 0 && (
            <button
              onClick={() => navigate('/donors')}
              className="flex items-center gap-3 p-4 rounded-xl border border-teal-200 dark:border-teal-800 bg-teal-50 dark:bg-teal-900/20 hover:bg-teal-100 dark:hover:bg-teal-900/30 transition-colors text-left"
            >
              <div className="p-2 rounded-lg bg-teal-100 dark:bg-teal-900/40 text-teal-600 dark:text-teal-400 flex-shrink-0">
                <HandCoins className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-teal-800 dark:text-teal-300 text-sm">
                  {new Intl.NumberFormat(undefined, { style: 'currency', currency: 'EUR' }).format(stats.activeGrantsAmount)} in grants
                </p>
                <p className="text-xs text-teal-600 dark:text-teal-500 mt-0.5">{stats.activeGrantsCount} active grant{stats.activeGrantsCount !== 1 ? 's' : ''}</p>
              </div>
            </button>
          )}
          {stats.unreadMessagesCount > 0 && (
            <button
              onClick={() => navigate('/messages')}
              className="flex items-center gap-3 p-4 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors text-left"
            >
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex-shrink-0">
                <MessageSquare className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-blue-800 dark:text-blue-300 text-sm">
                  {stats.unreadMessagesCount} unread message{stats.unreadMessagesCount !== 1 ? 's' : ''}
                </p>
                <p className="text-xs text-blue-600 dark:text-blue-500 mt-0.5">Click to open inbox</p>
              </div>
            </button>
          )}
        </div>
      )}

      {/* Charts */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
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
                >
                  {staffData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
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
                >
                  {studentData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">{t('dashboard.libraryStatus')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={libraryData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill="#3b82f6" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Branch Overview */}
      {branchStats.length > 0 && (
        <Card>
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
                  className="flex items-center justify-between p-3 rounded-lg border bg-muted/30"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{branch.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{branch.province}</p>
                  </div>
                  <div className="text-right ml-3 flex-shrink-0">
                    <p className="font-semibold text-sm">{branch.memberCount}</p>
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
        <Card>
          <CardHeader>
            <CardTitle>{t('dashboard.recentActivity')}</CardTitle>
          </CardHeader>
          <CardContent>
            {recentActivities.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('common.noData')}</p>
            ) : (
              <div className="space-y-3">
                {recentActivities.map((activity) => (
                  <div key={activity.id} className="flex items-start gap-3">
                    <div className={`mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold
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

        <Card>
          <CardHeader>
            <CardTitle>{t('dashboard.quickActions')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              <Button variant="outline" className="justify-start" onClick={() => navigate('/staff')}>
                <Plus className="mr-2 h-4 w-4" />
                {t('staff.addStaff')}
              </Button>
              <Button variant="outline" className="justify-start" onClick={() => navigate('/students')}>
                <Plus className="mr-2 h-4 w-4" />
                {t('students.addStudent')}
              </Button>
              <Button variant="outline" className="justify-start" onClick={() => navigate('/classes')}>
                <Plus className="mr-2 h-4 w-4" />
                {t('classes.addClass')}
              </Button>
              <Button variant="outline" className="justify-start" onClick={() => navigate('/library')}>
                <Plus className="mr-2 h-4 w-4" />
                {t('library.addBook')}
              </Button>
              <Button variant="outline" className="justify-start" onClick={() => navigate('/attendance')}>
                <ClipboardCheck className="mr-2 h-4 w-4" />
                Attendance
              </Button>
              <Button variant="outline" className="justify-start" onClick={() => navigate('/timetable')}>
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
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
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
        <Card>
          <CardHeader>
            <CardTitle>{t('dashboard.recentActivity')}</CardTitle>
          </CardHeader>
          <CardContent>
            {recentActivities.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('common.noData')}</p>
            ) : (
              <div className="space-y-3">
                {recentActivities.slice(0, 5).map((activity) => (
                  <div key={activity.id} className="flex items-start gap-3">
                    <div className={`mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold
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

        <Card>
          <CardHeader>
            <CardTitle>{t('dashboard.quickActions')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-3">
              <Button variant="outline" className="justify-start" onClick={() => navigate('/classes')}>
                <BookOpen className="mr-2 h-4 w-4" />
                {t('classes.title')}
              </Button>
              <Button variant="outline" className="justify-start" onClick={() => navigate('/students')}>
                <GraduationCap className="mr-2 h-4 w-4" />
                {t('nav.students')}
              </Button>
              <Button variant="outline" className="justify-start" onClick={() => navigate('/library')}>
                <Library className="mr-2 h-4 w-4" />
                {t('nav.library')}
              </Button>
              <Button variant="outline" className="justify-start" onClick={() => navigate('/attendance')}>
                <ClipboardCheck className="mr-2 h-4 w-4" />
                Attendance
              </Button>
              <Button variant="outline" className="justify-start" onClick={() => navigate('/timetable')}>
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
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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
        <Card>
          <CardHeader>
            <CardTitle>{t('library.borrowedBooks')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
              <BookOpen className="h-8 w-8 mb-2 opacity-40" />
              <p className="text-sm font-medium">{stats.borrowedBooks} {t('dashboard.borrowedBooks').toLowerCase()}</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => navigate('/library')}>
                {t('common.view')} {t('nav.library')}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('dashboard.quickActions')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-3">
              <Button variant="outline" className="justify-start" onClick={() => navigate('/library')}>
                <Plus className="mr-2 h-4 w-4" />
                {t('library.addBook')}
              </Button>
              <Button variant="outline" className="justify-start" onClick={() => navigate('/library')}>
                <UserCheck className="mr-2 h-4 w-4" />
                {t('library.lendBook')}
              </Button>
              <Button variant="outline" className="justify-start" onClick={() => navigate('/library')}>
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
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
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
        <Card>
          <CardHeader>
            <CardTitle>{t('nav.classes')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
              <BookOpen className="h-8 w-8 mb-2 opacity-40" />
              <p className="text-sm">{t('classes.classList')}</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => navigate('/classes')}>
                {t('common.view')} {t('nav.classes')}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('nav.library')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
              <Library className="h-8 w-8 mb-2 opacity-40" />
              <p className="text-sm">{t('library.bookList')}</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => navigate('/library')}>
                {t('common.view')} {t('nav.library')}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Student quick actions */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Button variant="outline" className="justify-start h-auto py-3" onClick={() => navigate('/my-profile')}>
          <GraduationCap className="mr-2 h-4 w-4 text-teal-600" />
          <div className="text-left">
            <p className="font-medium text-sm">My Grades</p>
            <p className="text-xs text-muted-foreground">View assessments & report card</p>
          </div>
        </Button>
        <Button variant="outline" className="justify-start h-auto py-3" onClick={() => navigate('/timetable')}>
          <CalendarDays className="mr-2 h-4 w-4 text-blue-600" />
          <div className="text-left">
            <p className="font-medium text-sm">Timetable</p>
            <p className="text-xs text-muted-foreground">Weekly class schedule</p>
          </div>
        </Button>
        <Button variant="outline" className="justify-start h-auto py-3" onClick={() => navigate('/library')}>
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
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          {t('dashboard.welcome')}, {user?.firstName}!
        </h1>
        <p className="text-muted-foreground">
          {t('dashboard.title')}
        </p>
      </div>

      {hasPermission(['superadmin', 'admin']) && renderAdminDashboard()}
      {user?.role === 'teacher' && renderTeacherDashboard()}
      {user?.role === 'librarian' && renderLibrarianDashboard()}
      {user?.role === 'student' && renderStudentDashboard()}
    </div>
  );
}
