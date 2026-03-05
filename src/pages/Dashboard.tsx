import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { StatCard } from '@/components/ui-custom/StatCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { mockClasses, mockBookLoans } from '@/lib/mockData';
import { fetchDashboardStats, fetchBranchStats, type DashboardStats, type BranchStat } from '@/services/dashboardService';
import { Users, UserCheck, GraduationCap, BookOpen, Library, Plus, Calendar, Clock, CircleAlert as AlertCircle, MapPin } from 'lucide-react';
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
};

export function Dashboard() {
  const { t } = useTranslation();
  const { user, hasPermission } = useAuth();
  const [stats, setStats] = useState<DashboardStats>(emptyStats);
  const [branchStats, setBranchStats] = useState<BranchStat[]>([]);

  useEffect(() => {
    fetchDashboardStats().then(setStats);
    fetchBranchStats().then(setBranchStats);
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
        <StatCard
          title={t('dashboard.totalStaff')}
          value={stats.totalStaff}
          description={`${stats.activeStaff} ${t('dashboard.activeStaff')}`}
          icon={Users}
        />
        <StatCard
          title={t('dashboard.totalStudents')}
          value={stats.totalStudents}
          description={`${stats.activeStudents} ${t('dashboard.activeStudents')}`}
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
            <p className="text-sm text-muted-foreground">{t('common.noData')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('dashboard.quickActions')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              <Button variant="outline" className="justify-start">
                <Plus className="mr-2 h-4 w-4" />
                {t('staff.addStaff')}
              </Button>
              <Button variant="outline" className="justify-start">
                <Plus className="mr-2 h-4 w-4" />
                {t('students.addStudent')}
              </Button>
              <Button variant="outline" className="justify-start">
                <Plus className="mr-2 h-4 w-4" />
                {t('classes.addClass')}
              </Button>
              <Button variant="outline" className="justify-start">
                <Plus className="mr-2 h-4 w-4" />
                {t('library.addBook')}
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
          title={t('dashboard.myClasses')}
          value={mockClasses.length}
          icon={BookOpen}
        />
        <StatCard
          title={t('dashboard.totalStudents')}
          value={stats.totalStudents}
          icon={GraduationCap}
        />
        <StatCard
          title={t('dashboard.attendanceSummary')}
          value="92%"
          icon={UserCheck}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('dashboard.myClasses')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {mockClasses.map((cls) => (
                <div key={cls.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <p className="font-medium">{cls.name}</p>
                    <p className="text-sm text-muted-foreground">{cls.schedule.length} sessions/week</p>
                  </div>
                  <Button variant="ghost" size="sm">
                    {t('common.view')}
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('dashboard.upcomingEvents')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <Calendar className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <p className="font-medium">Català Bàsic A1</p>
                  <p className="text-sm text-muted-foreground">Monday, 9:00 - 11:00</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Calendar className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <p className="font-medium">Català Intermedi B1</p>
                  <p className="text-sm text-muted-foreground">Tuesday, 10:00 - 12:00</p>
                </div>
              </div>
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
          iconClassName="bg-red-100"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('library.borrowedBooks')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {mockBookLoans.map((loan) => (
                <div key={loan.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <p className="font-medium">{loan.bookTitle}</p>
                    <p className="text-sm text-muted-foreground">
                      {t('library.borrower')}: {loan.borrowerName}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{loan.dueDate}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('dashboard.quickActions')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-3">
              <Button variant="outline" className="justify-start">
                <Plus className="mr-2 h-4 w-4" />
                {t('library.addBook')}
              </Button>
              <Button variant="outline" className="justify-start">
                <UserCheck className="mr-2 h-4 w-4" />
                {t('library.lendBook')}
              </Button>
              <Button variant="outline" className="justify-start">
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
          title={t('dashboard.myClasses')}
          value={2}
          icon={BookOpen}
        />
        <StatCard
          title={t('library.booksBorrowed')}
          value={1}
          icon={Library}
        />
        <StatCard
          title={t('dashboard.dueSoon')}
          value={1}
          icon={Clock}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('dashboard.myClasses')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {mockClasses.slice(0, 2).map((cls) => (
                <div key={cls.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <p className="font-medium">{cls.name}</p>
                    <p className="text-sm text-muted-foreground">{cls.teacherName}</p>
                  </div>
                  <Button variant="ghost" size="sm">
                    {t('common.view')}
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('dashboard.upcomingEvents')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <Calendar className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <p className="font-medium">Català Bàsic A1</p>
                  <p className="text-sm text-muted-foreground">Monday, 9:00 - 11:00</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
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
