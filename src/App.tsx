import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { Toaster } from '@/components/ui/sonner';
import i18n from '@/i18n';

// Layouts
import { MainLayout } from '@/components/layout/MainLayout';

// Pages
import { Login } from '@/pages/Login';
import { Dashboard } from '@/pages/Dashboard';
import { Staff } from '@/pages/Staff';
import { Branches } from '@/pages/Branches';
import { Students } from '@/pages/Students';
import { Classes } from '@/pages/Classes';
import { Library } from '@/pages/Library';
import { Settings } from '@/pages/Settings';

import type { UserRole } from '@/contexts/AuthContext';

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
            <ProtectedRoute requiredRoles={['superadmin', 'admin']}>
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
          path="classes"
          element={
            <ProtectedRoute requiredRoles={['superadmin', 'admin', 'teacher', 'student']}>
              <Classes />
            </ProtectedRoute>
          }
        />
        <Route
          path="library"
          element={
            <ProtectedRoute requiredRoles={['superadmin', 'admin', 'librarian', 'student']}>
              <Library />
            </ProtectedRoute>
          }
        />
        <Route
          path="settings"
          element={
            <ProtectedRoute requiredRoles={['superadmin', 'admin']}>
              <Settings />
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
          </BrowserRouter>
          <Toaster />
        </AuthProvider>
      </ThemeProvider>
    </I18nextProvider>
  );
}

export default App;
