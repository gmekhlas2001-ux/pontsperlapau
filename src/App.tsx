/**
 * App.tsx — Root application component.
 *
 * Assembles the global provider tree (i18n, theme, auth) and defines the
 * route table with role-based access control.  Each route specifies which
 * user roles are allowed; the ProtectedRoute wrapper handles redirects for
 * unauthenticated or unauthorized users.
 */

import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { getMyStudentRecord } from '@/services/studentService';
import { I18nextProvider } from 'react-i18next';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { Toaster } from '@/components/ui/sonner';
import i18n from '@/i18n';

// Layout shell (sidebar + header + content outlet)
import { MainLayout } from '@/components/layout/MainLayout';

import type { UserRole } from '@/contexts/AuthContext';

const Login = lazy(() => import('@/pages/Login').then((m) => ({ default: m.Login })));
const Dashboard = lazy(() => import('@/pages/Dashboard').then((m) => ({ default: m.Dashboard })));
const Staff = lazy(() => import('@/pages/Staff').then((m) => ({ default: m.Staff })));
const Branches = lazy(() => import('@/pages/Branches').then((m) => ({ default: m.Branches })));
const Students = lazy(() => import('@/pages/Students').then((m) => ({ default: m.Students })));
const Classes = lazy(() => import('@/pages/Classes').then((m) => ({ default: m.Classes })));
const Library = lazy(() => import('@/pages/Library').then((m) => ({ default: m.Library })));
const Settings = lazy(() => import('@/pages/Settings').then((m) => ({ default: m.Settings })));
const Reports = lazy(() => import('@/pages/Reports').then((m) => ({ default: m.Reports })));
const Surveys = lazy(() => import('@/pages/Surveys').then((m) => ({ default: m.Surveys })));
const SurveyCreatePage = lazy(() => import('@/pages/Surveys').then((m) => ({ default: m.SurveyCreatePage })));
const PasswordResets = lazy(() => import('@/pages/PasswordResets').then((m) => ({ default: m.PasswordResets })));
const Profile = lazy(() => import('@/pages/Profile').then((m) => ({ default: m.Profile })));
const Attendance = lazy(() => import('@/pages/Attendance').then((m) => ({ default: m.Attendance })));
const Grades = lazy(() => import('@/pages/Grades').then((m) => ({ default: m.Grades })));
const StudentProfile = lazy(() => import('@/pages/StudentProfile').then((m) => ({ default: m.StudentProfile })));
const Timetable = lazy(() => import('@/pages/Timetable').then((m) => ({ default: m.Timetable })));
const Fees = lazy(() => import('@/pages/Fees'));
const ParentDashboard = lazy(() => import('@/pages/ParentDashboard'));
const ParentLinks = lazy(() => import('@/pages/ParentLinks'));
const CalendarView = lazy(() => import('@/pages/CalendarView'));
const Messages = lazy(() => import('@/pages/Messages'));
const Donors = lazy(() => import('@/pages/Donors'));
const AuditLog = lazy(() => import('@/pages/AuditLog'));

function RouteFallback() {
  return (
    <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">
      Loading...
    </div>
  );
}

/**
 * Resolves the current user's student record and redirects to their profile.
 * Only reached by the student role via the /my-profile route.
 */
function MyProfileRedirect() {
  const navigate = useNavigate();
  useEffect(() => {
    getMyStudentRecord().then((res) => {
      if (res.success && res.studentId) {
        navigate(`/students/${res.studentId}`, { replace: true });
      } else {
        navigate('/', { replace: true });
      }
    });
  }, [navigate]);
  return null;
}

/**
 * Route guard component.
 * - Redirects unauthenticated users to /login.
 * - Redirects authenticated users without required roles to the dashboard.
 * - Superadmin implicitly passes all role checks (handled in AuthContext).
 */
function ProtectedRoute({
  children,
  requiredRoles = [],
}: {
  children: React.ReactNode;
  requiredRoles?: UserRole[];
}) {
  const { isAuthenticated, hasPermission } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (requiredRoles.length > 0 && !hasPermission(requiredRoles)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <MainLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Dashboard />} />
          <Route
            path="staff"
            element={
              <ProtectedRoute requiredRoles={['superadmin', 'admin']}>
                <Staff />
              </ProtectedRoute>
            }
          />
          <Route
            path="branches"
            element={
              <ProtectedRoute requiredRoles={['superadmin']}>
                <Branches />
              </ProtectedRoute>
            }
          />
          <Route
            path="students"
            element={
              <ProtectedRoute requiredRoles={['superadmin', 'admin', 'teacher']}>
                <Students />
              </ProtectedRoute>
            }
          />
          <Route
            path="students/:id"
            element={
              <ProtectedRoute requiredRoles={['superadmin', 'admin', 'teacher', 'student', 'parent']}>
                <StudentProfile />
              </ProtectedRoute>
            }
          />
          <Route path="my-profile" element={<MyProfileRedirect />} />
          <Route
            path="classes"
            element={
              <ProtectedRoute requiredRoles={['superadmin', 'admin', 'teacher', 'student']}>
                <Classes />
              </ProtectedRoute>
            }
          />
          <Route
            path="attendance"
            element={
              <ProtectedRoute requiredRoles={['superadmin', 'admin', 'teacher']}>
                <Attendance />
              </ProtectedRoute>
            }
          />
          <Route
            path="grades"
            element={
              <ProtectedRoute requiredRoles={['superadmin', 'admin', 'teacher']}>
                <Grades />
              </ProtectedRoute>
            }
          />
          <Route
            path="timetable"
            element={
              <ProtectedRoute requiredRoles={['superadmin', 'admin', 'teacher', 'student']}>
                <Timetable />
              </ProtectedRoute>
            }
          />
          <Route
            path="fees"
            element={
              <ProtectedRoute requiredRoles={['superadmin', 'admin', 'teacher']}>
                <Fees />
              </ProtectedRoute>
            }
          />
          <Route
            path="parent-portal"
            element={
              <ProtectedRoute requiredRoles={['parent']}>
                <ParentDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="parent-links"
            element={
              <ProtectedRoute requiredRoles={['superadmin', 'admin']}>
                <ParentLinks />
              </ProtectedRoute>
            }
          />
          <Route
            path="calendar"
            element={
              <ProtectedRoute requiredRoles={['superadmin', 'admin', 'teacher', 'student']}>
                <CalendarView />
              </ProtectedRoute>
            }
          />
          <Route
            path="messages"
            element={
              <ProtectedRoute requiredRoles={['superadmin', 'admin', 'teacher', 'librarian']}>
                <Messages />
              </ProtectedRoute>
            }
          />
          <Route
            path="donors"
            element={
              <ProtectedRoute requiredRoles={['superadmin', 'admin']}>
                <Donors />
              </ProtectedRoute>
            }
          />
          <Route
            path="library"
            element={
              <ProtectedRoute requiredRoles={['superadmin', 'admin', 'teacher', 'librarian', 'student']}>
                <Library />
              </ProtectedRoute>
            }
          />
          <Route
            path="reports"
            element={
              <ProtectedRoute requiredRoles={['superadmin', 'admin']}>
                <Reports />
              </ProtectedRoute>
            }
          />
          <Route
            path="surveys/new"
            element={
              <ProtectedRoute requiredRoles={['superadmin', 'admin']}>
                <SurveyCreatePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="surveys"
            element={
              <ProtectedRoute requiredRoles={['superadmin', 'admin']}>
                <Surveys />
              </ProtectedRoute>
            }
          />
          <Route
            path="password-resets"
            element={
              <ProtectedRoute requiredRoles={['superadmin', 'admin']}>
                <PasswordResets />
              </ProtectedRoute>
            }
          />
          <Route
            path="audit-log"
            element={
              <ProtectedRoute requiredRoles={['superadmin', 'admin']}>
                <AuditLog />
              </ProtectedRoute>
            }
          />
          <Route
            path="settings"
            element={
              <ProtectedRoute requiredRoles={['superadmin']}>
                <Settings />
              </ProtectedRoute>
            }
          />
          <Route
            path="profile"
            element={
              <ProtectedRoute>
                <Profile />
              </ProtectedRoute>
            }
          />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

function App() {
  return (
    <I18nextProvider i18n={i18n}>
      <ThemeProvider>
        <AuthProvider>
          <BrowserRouter>
            <AppRoutes />
            <Toaster />
          </BrowserRouter>
        </AuthProvider>
      </ThemeProvider>
    </I18nextProvider>
  );
}

export default App;
