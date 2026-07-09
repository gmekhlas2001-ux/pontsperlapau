/**
 * App.tsx — Root application component.
 *
 * Assembles the global provider tree and mounts feature-module routes.
 */

import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { AuthProvider } from '@/contexts/AuthContext';
import { Toaster } from '@/components/ui/sonner';
import i18n from '@/i18n';
import { LiteralTranslationBridge } from '@/i18n/LiteralTranslationBridge';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/layout/ProtectedRoute';
import { moduleRoutes } from '@/modules/registry';

const Login = lazy(() => import('@/pages/Login').then((m) => ({ default: m.Login })));

function RouteFallback() {
  return (
    <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">
      Loading...
    </div>
  );
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
          {moduleRoutes.map((route) => {
            const RouteComponent = route.component;
            const element = (
              <ProtectedRoute requiredRoles={route.roles ?? []}>
                <RouteComponent />
              </ProtectedRoute>
            );

            return route.index ? (
              <Route key={route.id} index element={element} />
            ) : (
              <Route key={route.id} path={route.path} element={element} />
            );
          })}
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

function App() {
  return (
    <I18nextProvider i18n={i18n}>
      <LiteralTranslationBridge />
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
