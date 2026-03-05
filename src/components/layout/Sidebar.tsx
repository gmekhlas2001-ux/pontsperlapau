import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth, type UserRole } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { VisuallyHidden } from '@/components/ui/visually-hidden';
import {
  LayoutDashboard,
  Users,
  GraduationCap,
  BookOpen,
  Library,
  Settings,
  LogOut,
  Menu,
  ChevronLeft,
  ChevronRight,
  MapPin,
} from 'lucide-react';

interface NavItem {
  path: string;
  label: string;
  icon: React.ElementType;
  roles: UserRole[];
}

interface SidebarProps {
  isCollapsed: boolean;
  onToggle: () => void;
  isMobileOpen: boolean;
  onMobileClose: () => void;
}

export function Sidebar({ isCollapsed, onToggle, isMobileOpen, onMobileClose }: SidebarProps) {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const location = useLocation();

  const navItems: NavItem[] = [
    { path: '/', label: t('nav.dashboard'), icon: LayoutDashboard, roles: ['superadmin', 'admin', 'teacher', 'librarian', 'student'] },
    { path: '/staff', label: t('nav.staff'), icon: Users, roles: ['superadmin', 'admin'] },
    { path: '/branches', label: 'Branches', icon: MapPin, roles: ['superadmin', 'admin'] },
    { path: '/students', label: t('nav.students'), icon: GraduationCap, roles: ['superadmin', 'admin', 'teacher'] },
    { path: '/classes', label: t('nav.classes'), icon: BookOpen, roles: ['superadmin', 'admin', 'teacher', 'student'] },
    { path: '/library', label: t('nav.library'), icon: Library, roles: ['superadmin', 'admin', 'librarian', 'student'] },
    { path: '/settings', label: t('nav.settings'), icon: Settings, roles: ['superadmin', 'admin'] },
  ];

  const filteredNavItems = navItems.filter(
    (item) => user && item.roles.includes(user.role)
  );

  const NavContent = () => (
    <>
      <div className="flex items-center justify-between p-4 border-b">
        <div className={cn('flex items-center gap-3', isCollapsed && 'justify-center')}>
          <img
            src="/image.png"
            alt="Ponts per la Pau"
            className={cn('object-contain flex-shrink-0', isCollapsed ? 'h-8 w-8' : 'h-10 w-10')}
          />
          {!isCollapsed && (
            <div className="flex flex-col">
              <span className="font-semibold text-sm">{t('app.name')}</span>
              <span className="text-xs text-muted-foreground">{t('app.tagline')}</span>
            </div>
          )}
        </div>
        {!isCollapsed && (
          <Button variant="ghost" size="icon" onClick={onToggle} className="hidden lg:flex">
            <ChevronLeft className="h-4 w-4" />
          </Button>
        )}
        {isCollapsed && (
          <Button variant="ghost" size="icon" onClick={onToggle} className="hidden lg:flex">
            <ChevronRight className="h-4 w-4" />
          </Button>
        )}
      </div>

      <ScrollArea className="flex-1 py-4">
        <nav className="space-y-1 px-2">
          {filteredNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            
            return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={onMobileClose}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                  isCollapsed && 'justify-center px-2'
                )}
              >
                <Icon className="h-5 w-5 flex-shrink-0" />
                {!isCollapsed && <span>{item.label}</span>}
              </NavLink>
            );
          })}
        </nav>
      </ScrollArea>

      <div className="p-4 border-t">
        <Button
          variant="ghost"
          className={cn(
            'w-full flex items-center gap-3 text-muted-foreground hover:text-foreground',
            isCollapsed && 'justify-center px-2'
          )}
          onClick={logout}
        >
          <LogOut className="h-5 w-5 flex-shrink-0" />
          {!isCollapsed && <span>{t('nav.logout')}</span>}
        </Button>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile Sidebar */}
      <Sheet open={isMobileOpen} onOpenChange={onMobileClose}>
        <SheetContent side="left" className="p-0 w-64">
          <VisuallyHidden>
            <SheetTitle>Navigation Menu</SheetTitle>
            <SheetDescription>Navigate to different sections of the application</SheetDescription>
          </VisuallyHidden>
          <div className="flex flex-col h-full">
            <NavContent />
          </div>
        </SheetContent>
      </Sheet>

      {/* Desktop Sidebar */}
      <aside
        className={cn(
          'hidden lg:flex flex-col h-screen border-r bg-background transition-all duration-300',
          isCollapsed ? 'w-16' : 'w-64'
        )}
      >
        <NavContent />
      </aside>
    </>
  );
}

export function MobileMenuButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="ghost" size="icon" className="lg:hidden" onClick={onClick}>
      <Menu className="h-5 w-5" />
    </Button>
  );
}
