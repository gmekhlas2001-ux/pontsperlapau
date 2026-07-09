import { lazy } from 'react';
import { ClipboardList } from 'lucide-react';
import type { FeatureModule } from '@/modules/types';

const Surveys = lazy(() => import('@/pages/Surveys').then((m) => ({ default: m.Surveys })));
const SurveyCreatePage = lazy(() => import('@/pages/Surveys').then((m) => ({ default: m.SurveyCreatePage })));

export const surveysModule: FeatureModule = {
  id: 'surveys',
  routes: [
    {
      id: 'surveys.create',
      path: 'surveys/new',
      component: SurveyCreatePage,
      roles: ['superadmin', 'admin'],
    },
    {
      id: 'surveys.list',
      path: 'surveys',
      component: Surveys,
      roles: ['superadmin', 'admin'],
    },
  ],
  nav: [
    {
      id: 'surveys.nav',
      path: '/surveys',
      labelKey: 'nav.surveys',
      icon: ClipboardList,
      roles: ['superadmin', 'admin'],
    },
  ],
};
