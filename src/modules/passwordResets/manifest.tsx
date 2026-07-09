import { lazy } from 'react';
import { KeyRound } from 'lucide-react';
import type { FeatureModule } from '@/modules/types';

const PasswordResets = lazy(() => import('@/pages/PasswordResets').then((m) => ({ default: m.PasswordResets })));

export const passwordResetsModule: FeatureModule = {
  id: 'passwordResets',
  routes: [
    {
      id: 'passwordResets.queue',
      path: 'password-resets',
      component: PasswordResets,
      roles: ['superadmin', 'admin'],
    },
  ],
  nav: [
    {
      id: 'passwordResets.nav',
      path: '/password-resets',
      labelKey: 'nav.passwordResets',
      icon: KeyRound,
      roles: ['superadmin', 'admin'],
    },
  ],
};
