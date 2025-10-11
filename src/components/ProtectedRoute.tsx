import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface ProtectedRouteProps {
  children: ReactNode;
  requireAdmin?: boolean;
  requireStaff?: boolean;
}

export function ProtectedRoute({ children, requireAdmin, requireStaff }: ProtectedRouteProps) {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user || !profile) {
    return <Navigate to="/login" replace />;
  }

  if (profile.status === 'pending') {
    return <Navigate to="/pending-approval" replace />;
  }

  if (profile.status === 'rejected') {
    return <Navigate to="/rejected" replace />;
  }

  if (requireAdmin && profile.role_id !== 'admin') {
    return <Navigate to="/dashboard" replace />;
  }

  if (requireStaff && !['admin', 'staff'].includes(profile.role_id || '')) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
