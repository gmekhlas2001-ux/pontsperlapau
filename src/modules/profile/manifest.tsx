import { lazy } from 'react';
import { User } from 'lucide-react';
import type { FeatureModule } from '@/modules/types';

const Profile = lazy(() => import('@/pages/Profile').then((m) => ({ default: m.Profile })));

export const profileModule: FeatureModule = {
  id: 'profile',
  routes: [
    {
      id: 'profile.view',
      path: 'profile',
      component: Profile,
    },
  ],
  nav: [
    {
      id: 'profile.nav',
      path: '/profile',
      labelKey: 'nav.profile',
      icon: User,
      roles: ['superadmin', 'admin', 'teacher', 'librarian', 'student'],
    },
  ],
};
