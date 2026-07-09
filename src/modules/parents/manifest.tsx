import { lazy } from 'react';
import { User, Users } from 'lucide-react';
import type { FeatureModule } from '@/modules/types';

const ParentDashboard = lazy(() => import('@/pages/ParentDashboard'));
const ParentLinks = lazy(() => import('@/pages/ParentLinks'));

export const parentsModule: FeatureModule = {
  id: 'parents',
  routes: [
    {
      id: 'parents.portal',
      path: 'parent-portal',
      component: ParentDashboard,
      roles: ['parent'],
    },
    {
      id: 'parents.links',
      path: 'parent-links',
      component: ParentLinks,
      roles: ['superadmin', 'admin'],
    },
  ],
  nav: [
    {
      id: 'parents.portal.nav',
      path: '/parent-portal',
      labelKey: 'nav.parentPortal',
      icon: User,
      roles: ['parent'],
    },
    {
      id: 'parents.links.nav',
      path: '/parent-links',
      labelKey: 'nav.parentLinks',
      icon: Users,
      roles: ['superadmin', 'admin'],
    },
  ],
};
