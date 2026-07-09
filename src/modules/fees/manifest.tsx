import { lazy } from 'react';
import { CircleDollarSign } from 'lucide-react';
import type { FeatureModule } from '@/modules/types';

const Fees = lazy(() => import('@/pages/Fees'));

export const feesModule: FeatureModule = {
  id: 'fees',
  routes: [
    {
      id: 'fees.list',
      path: 'fees',
      component: Fees,
      roles: ['superadmin', 'admin', 'teacher'],
    },
  ],
  nav: [
    {
      id: 'fees.nav',
      path: '/fees',
      labelKey: 'nav.fees',
      icon: CircleDollarSign,
      roles: ['superadmin', 'admin', 'teacher'],
    },
  ],
};
