import { lazy } from 'react';
import { HandCoins } from 'lucide-react';
import type { FeatureModule } from '@/modules/types';

const Donors = lazy(() => import('@/pages/Donors'));

export const donorsModule: FeatureModule = {
  id: 'donors',
  routes: [
    {
      id: 'donors.list',
      path: 'donors',
      component: Donors,
      roles: ['superadmin', 'admin'],
    },
  ],
  nav: [
    {
      id: 'donors.nav',
      path: '/donors',
      labelKey: 'nav.donors',
      icon: HandCoins,
      roles: ['superadmin', 'admin'],
    },
  ],
};
