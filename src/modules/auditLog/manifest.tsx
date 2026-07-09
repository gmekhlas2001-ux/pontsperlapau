import { lazy } from 'react';
import { ShieldCheck } from 'lucide-react';
import type { FeatureModule } from '@/modules/types';

const AuditLog = lazy(() => import('@/pages/AuditLog'));

export const auditLogModule: FeatureModule = {
  id: 'auditLog',
  routes: [
    {
      id: 'auditLog.view',
      path: 'audit-log',
      component: AuditLog,
      roles: ['superadmin', 'admin'],
    },
  ],
  nav: [
    {
      id: 'auditLog.nav',
      path: '/audit-log',
      labelKey: 'nav.auditLog',
      icon: ShieldCheck,
      roles: ['superadmin', 'admin'],
    },
  ],
};
