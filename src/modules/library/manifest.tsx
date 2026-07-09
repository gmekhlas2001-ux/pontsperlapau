import { lazy } from 'react';
import { Library } from 'lucide-react';
import type { FeatureModule } from '@/modules/types';

const LibraryPage = lazy(() => import('@/pages/Library').then((m) => ({ default: m.Library })));

export const libraryModule: FeatureModule = {
  id: 'library',
  routes: [
    {
      id: 'library.catalog',
      path: 'library',
      component: LibraryPage,
      roles: ['superadmin', 'admin', 'teacher', 'librarian', 'student'],
    },
  ],
  nav: [
    {
      id: 'library.nav',
      path: '/library',
      labelKey: 'nav.library',
      icon: Library,
      roles: ['superadmin', 'admin', 'teacher', 'librarian', 'student'],
    },
  ],
};
