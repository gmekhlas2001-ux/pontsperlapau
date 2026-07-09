import { lazy } from 'react';
import { MessageSquare } from 'lucide-react';
import type { FeatureModule } from '@/modules/types';

const Messages = lazy(() => import('@/pages/Messages'));

export const messagesModule: FeatureModule = {
  id: 'messages',
  routes: [
    {
      id: 'messages.inbox',
      path: 'messages',
      component: Messages,
      roles: ['superadmin', 'admin', 'teacher', 'librarian'],
    },
  ],
  nav: [
    {
      id: 'messages.nav',
      path: '/messages',
      labelKey: 'nav.messages',
      icon: MessageSquare,
      roles: ['superadmin', 'admin', 'teacher', 'librarian'],
    },
  ],
};
