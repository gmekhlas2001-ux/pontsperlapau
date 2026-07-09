import { lazy } from 'react';
import { LayoutDashboard } from 'lucide-react';
import type { FeatureModule } from '@/modules/types';

const Dashboard = lazy(() => import('@/pages/Dashboard').then((m) => ({ default: m.Dashboard })));

export const dashboardModule: FeatureModule = {
  id: 'dashboard',
  routes: [
    {
      id: 'dashboard.home',
      index: true,
      component: Dashboard,
    },
  ],
  nav: [
    {
      id: 'dashboard.nav',
      path: '/',
      labelKey: 'nav.dashboard',
      icon: LayoutDashboard,
      roles: ['superadmin', 'admin', 'teacher', 'librarian', 'student'],
    },
  ],
};
