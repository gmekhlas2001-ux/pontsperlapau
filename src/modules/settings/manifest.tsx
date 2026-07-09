import { lazy } from 'react';
import { Settings } from 'lucide-react';
import type { FeatureModule } from '@/modules/types';

const SettingsPage = lazy(() => import('@/pages/Settings').then((m) => ({ default: m.Settings })));

export const settingsModule: FeatureModule = {
  id: 'settings',
  routes: [
    {
      id: 'settings.view',
      path: 'settings',
      component: SettingsPage,
      roles: ['superadmin'],
    },
  ],
  nav: [
    {
      id: 'settings.nav',
      path: '/settings',
      labelKey: 'nav.settings',
      icon: Settings,
      roles: ['superadmin'],
    },
  ],
};
