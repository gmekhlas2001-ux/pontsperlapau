import { lazy } from 'react';
import { GraduationCap } from 'lucide-react';
import type { FeatureModule } from '@/modules/types';
import { MyProfileRedirect } from './MyProfileRedirect';

const Students = lazy(() => import('@/pages/Students').then((m) => ({ default: m.Students })));
const StudentProfile = lazy(() => import('@/pages/StudentProfile').then((m) => ({ default: m.StudentProfile })));

export const studentsModule: FeatureModule = {
  id: 'students',
  routes: [
    {
      id: 'students.list',
      path: 'students',
      component: Students,
      roles: ['superadmin', 'admin', 'teacher'],
    },
    {
      id: 'students.profile',
      path: 'students/:id',
      component: StudentProfile,
      roles: ['superadmin', 'admin', 'teacher', 'student', 'parent'],
    },
    {
      id: 'students.myProfile',
      path: 'my-profile',
      component: MyProfileRedirect,
      roles: ['student'],
    },
  ],
  nav: [
    {
      id: 'students.nav',
      path: '/students',
      labelKey: 'nav.students',
      icon: GraduationCap,
      roles: ['superadmin', 'admin', 'teacher'],
    },
    {
      id: 'students.myProfile.nav',
      path: '/my-profile',
      labelKey: 'nav.myGrades',
      icon: GraduationCap,
      roles: ['student'],
    },
  ],
};
