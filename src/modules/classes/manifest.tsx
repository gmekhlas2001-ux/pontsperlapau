import { lazy } from 'react';
import { BookOpen } from 'lucide-react';
import type { FeatureModule } from '@/modules/types';

const Classes = lazy(() => import('@/pages/Classes').then((m) => ({ default: m.Classes })));

export const classesModule: FeatureModule = {
  id: 'classes',
  routes: [
    {
      id: 'classes.list',
      path: 'classes',
      component: Classes,
      roles: ['superadmin', 'admin', 'teacher', 'student'],
    },
  ],
  nav: [
    {
      id: 'classes.nav',
      path: '/classes',
      labelKey: 'nav.classes',
      icon: BookOpen,
      roles: ['superadmin', 'admin', 'teacher', 'student'],
    },
  ],
};
