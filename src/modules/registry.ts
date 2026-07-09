import type { FeatureNavItem, FeatureRoute } from '@/modules/types';
import { attendanceModule } from './attendance/manifest';
import { auditLogModule } from './auditLog/manifest';
import { branchesModule } from './branches/manifest';
import { calendarModule } from './calendar/manifest';
import { classesModule } from './classes/manifest';
import { dashboardModule } from './dashboard/manifest';
import { donorsModule } from './donors/manifest';
import { feesModule } from './fees/manifest';
import { gradesModule } from './grades/manifest';
import { libraryModule } from './library/manifest';
import { messagesModule } from './messages/manifest';
import { parentsModule } from './parents/manifest';
import { passwordResetsModule } from './passwordResets/manifest';
import { profileModule } from './profile/manifest';
import { reportsModule } from './reports/manifest';
import { settingsModule } from './settings/manifest';
import { staffModule } from './staff/manifest';
import { studentsModule } from './students/manifest';
import { surveysModule } from './surveys/manifest';
import { timetableModule } from './timetable/manifest';

export const featureModules = [
  dashboardModule,
  staffModule,
  branchesModule,
  studentsModule,
  classesModule,
  attendanceModule,
  gradesModule,
  timetableModule,
  calendarModule,
  feesModule,
  parentsModule,
  messagesModule,
  donorsModule,
  libraryModule,
  surveysModule,
  reportsModule,
  passwordResetsModule,
  auditLogModule,
  profileModule,
  settingsModule,
];

export const moduleRoutes: FeatureRoute[] = featureModules.flatMap((module) => module.routes);
export const moduleNavItems: FeatureNavItem[] = featureModules.flatMap((module) => module.nav ?? []);

function normalizePath(pathname: string): string {
  if (pathname === '/') return '/';
  const withoutQuery = pathname.split('?')[0].split('#')[0];
  return withoutQuery.replace(/\/+$/, '') || '/';
}

export function findNavItemForPathname(pathname: string): FeatureNavItem | undefined {
  const current = normalizePath(pathname);
  return moduleNavItems
    .filter((item) => (
      item.path === '/'
        ? current === '/'
        : current === item.path || current.startsWith(`${item.path}/`)
    ))
    .sort((a, b) => b.path.length - a.path.length)[0];
}
