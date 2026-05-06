/**
 * App.tsx — Root application component.
 *
 * Assembles the global provider tree (i18n, theme, auth) and defines the
 * route table with role-based access control.  Each route specifies which
 * user roles are allowed; the ProtectedRoute wrapper handles redirects for
 * unauthenticated or unauthorized users.
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { Toaster } from '@/components/ui/sonner';
import i18n from '@/i18n';

// Layout shell (sidebar + header + content outlet)
import { MainLayout } from '@/components/layout/MainLayout';

// Page-level components
import { Login } from '@/pages/Login';
import { Dashboard } from '@/pages/Dashboard';
import { Staff } from '@/pages/Staff';
import { Branches } from '@/pages/Branches';
import { Students } from '@/pages/Students';
import { Classes } from '@/pages/Classes';
import { Library } from '@/pages/Library';
import { Settings } from '@/pages/Settings';
import { Reports } from '@/pages/Reports';
import { Surveys } from '@/pages/Surveys';
import { PasswordResets } from '@/pages/PasswordResets';
import { Profile } from '@/pages/Profile';
import { Attendance } from '@/pages/Attendance';
import { Grades } from '@/pages/Grades';
import { StudentProfile } from '@/pages/StudentProfile';

import type { UserRole } from '@/contexts/AuthContext';

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
            <ProtectedRoute requiredRoles={['superadmin', 'admin', 'teacher']}>
              <StudentProfile />
            </ProtectedRoute>
          }
        />
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
