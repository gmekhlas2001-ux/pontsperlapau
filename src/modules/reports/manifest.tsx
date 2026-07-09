import { lazy } from 'react';
import { ChartBar } from 'lucide-react';
import type { FeatureModule } from '@/modules/types';

const Reports = lazy(() => import('@/pages/Reports').then((m) => ({ default: m.Reports })));

export const reportsModule: FeatureModule = {
  id: 'reports',
  routes: [
    {
      id: 'reports.view',
      path: 'reports',
      component: Reports,
      roles: ['superadmin', 'admin'],
    },
  ],
  nav: [
    {
      id: 'reports.nav',
      path: '/reports',
      labelKey: 'nav.reports',
      icon: ChartBar,
      roles: ['superadmin', 'admin'],
    },
  ],
};
