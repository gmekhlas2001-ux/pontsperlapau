import { lazy } from 'react';
import { MapPin } from 'lucide-react';
import type { FeatureModule } from '@/modules/types';

const Branches = lazy(() => import('@/pages/Branches').then((m) => ({ default: m.Branches })));

export const branchesModule: FeatureModule = {
  id: 'branches',
  routes: [
    {
      id: 'branches.list',
      path: 'branches',
      component: Branches,
      roles: ['superadmin'],
    },
  ],
  nav: [
    {
      id: 'branches.nav',
      path: '/branches',
      labelKey: 'nav.branches',
      icon: MapPin,
      roles: ['superadmin'],
    },
  ],
};
