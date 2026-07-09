import { lazy } from 'react';
import { CalendarDays } from 'lucide-react';
import type { FeatureModule } from '@/modules/types';

const CalendarView = lazy(() => import('@/pages/CalendarView'));

export const calendarModule: FeatureModule = {
  id: 'calendar',
  routes: [
    {
      id: 'calendar.view',
      path: 'calendar',
      component: CalendarView,
      roles: ['superadmin', 'admin', 'teacher', 'student'],
    },
  ],
  nav: [
    {
      id: 'calendar.nav',
      path: '/calendar',
      labelKey: 'nav.calendar',
      icon: CalendarDays,
      roles: ['superadmin', 'admin', 'teacher', 'student'],
    },
  ],
};
