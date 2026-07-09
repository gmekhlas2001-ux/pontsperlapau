import { lazy } from 'react';
import { CalendarDays } from 'lucide-react';
import type { FeatureModule } from '@/modules/types';

const Timetable = lazy(() => import('@/pages/Timetable').then((m) => ({ default: m.Timetable })));

export const timetableModule: FeatureModule = {
  id: 'timetable',
  routes: [
    {
      id: 'timetable.view',
      path: 'timetable',
      component: Timetable,
      roles: ['superadmin', 'admin', 'teacher', 'student'],
    },
  ],
  nav: [
    {
      id: 'timetable.nav',
      path: '/timetable',
      labelKey: 'nav.timetable',
      icon: CalendarDays,
      roles: ['superadmin', 'admin', 'teacher', 'student'],
    },
  ],
};
