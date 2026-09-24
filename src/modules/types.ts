import type { ElementType } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { UserRole } from '@/contexts/AuthContext';

export interface FeatureRoute {
  id: string;
  moduleId?: string;
  path?: string;
  index?: boolean;
  component: ElementType;
  roles?: UserRole[];
}

export interface FeatureNavItem {
  id: string;
  moduleId?: string;
  path: string;
  labelKey: string;
  icon: LucideIcon;
  roles: UserRole[];
}

export interface FeatureModule {
  id: string;
  routes: FeatureRoute[];
  nav?: FeatureNavItem[];
}
