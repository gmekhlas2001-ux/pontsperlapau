import { lazy } from 'react';
import { GraduationCap } from 'lucide-react';
import type { FeatureModule } from '@/modules/types';

const Grades = lazy(() => import('@/pages/Grades').then((m) => ({ default: m.Grades })));

export const gradesModule: FeatureModule = {
  id: 'grades',
  routes: [
    {
      id: 'grades.list',
      path: 'grades',
      component: Grades,
      roles: ['superadmin', 'admin', 'teacher'],
    },
  ],
  nav: [
    {
      id: 'grades.nav',
      path: '/grades',
      labelKey: 'nav.grades',
      icon: GraduationCap,
      roles: ['superadmin', 'admin', 'teacher'],
    },
  ],
};
