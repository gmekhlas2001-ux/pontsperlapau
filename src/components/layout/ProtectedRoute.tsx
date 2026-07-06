import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import type { UserRole } from '@/contexts/AuthContext';

function RouteFallback() {
  return (
    <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">
      Loading...
    </div>
  );
}

/**
 * Route guard component.
 * - Redirects unauthenticated users to /login.
 * - Redirects authenticated users without required roles to the dashboard.
 * - Superadmin implicitly passes all role checks (handled in AuthContext).
 */
export function ProtectedRoute({
  children,
  requiredRoles = [],
}: {
  children: React.ReactNode;
  requiredRoles?: UserRole[];
}) {
  const { isAuthenticated, hasPermission, isLoading } = useAuth();

  if (isLoading) return <RouteFallback />;

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (requiredRoles.length > 0 && !hasPermission(requiredRoles)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
