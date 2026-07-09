import { lazy } from 'react';
import { ClipboardCheck } from 'lucide-react';
import type { FeatureModule } from '@/modules/types';

const Attendance = lazy(() => import('@/pages/Attendance').then((m) => ({ default: m.Attendance })));

export const attendanceModule: FeatureModule = {
  id: 'attendance',
  routes: [
    {
      id: 'attendance.list',
      path: 'attendance',
      component: Attendance,
      roles: ['superadmin', 'admin', 'teacher'],
    },
  ],
  nav: [
    {
      id: 'attendance.nav',
      path: '/attendance',
      labelKey: 'nav.attendance',
      icon: ClipboardCheck,
      roles: ['superadmin', 'admin', 'teacher'],
    },
  ],
};
