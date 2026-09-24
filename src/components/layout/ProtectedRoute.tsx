import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Navigate } from 'react-router';
import { useAuth } from '@/contexts/AuthContext';
import type { UserRole } from '@/contexts/AuthContext';

function RouteFallback() {
  return (
    <div className="flex h-dvh items-center justify-center text-sm text-muted-foreground">
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
  moduleId,
}: {
  children: React.ReactNode;
  requiredRoles?: UserRole[];
  moduleId?: string;
}) {
  const { isAuthenticated, hasPermission, hasModuleAccess, isLoading, accessLoading, sessionError, retrySession } = useAuth();
  const { t } = useTranslation();

  if (isLoading || (isAuthenticated && accessLoading)) return <RouteFallback />;

  if (sessionError) return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <p role="alert">{t('common.sessionUnavailable')}</p>
      <Button onClick={retrySession}>{t('common.retry')}</Button>
    </main>
  );

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (requiredRoles.length > 0 && !hasPermission(requiredRoles)) {
    return <Navigate to="/" replace />;
  }

  if (moduleId && !hasModuleAccess(moduleId)) {
    return <main className="mx-auto max-w-xl p-8 text-center" role="alert">
      <h1 className="text-2xl font-semibold">{t('moduleAccess.unavailableTitle')}</h1>
      <p className="mt-2 text-muted-foreground">{t('moduleAccess.unavailableDescription')}</p>
    </main>;
  }

  return <>{children}</>;
}
