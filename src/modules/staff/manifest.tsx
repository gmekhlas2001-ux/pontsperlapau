import { lazy } from 'react';
import { Users } from 'lucide-react';
import type { FeatureModule } from '@/modules/types';

const Staff = lazy(() => import('@/pages/Staff').then((m) => ({ default: m.Staff })));

export const staffModule: FeatureModule = {
  id: 'staff',
  routes: [
    {
      id: 'staff.list',
      path: 'staff',
      component: Staff,
      roles: ['superadmin', 'admin'],
    },
  ],
  nav: [
    {
      id: 'staff.nav',
      path: '/staff',
      labelKey: 'nav.staff',
      icon: Users,
      roles: ['superadmin', 'admin'],
    },
  ],
};
