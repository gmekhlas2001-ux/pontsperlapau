import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { VisuallyHidden } from '@/components/ui/visually-hidden';
import { LogOut, Menu, ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react';
import { moduleNavItems } from '@/modules/registry';

interface SidebarProps {
  isCollapsed: boolean;
  onToggle: () => void;
  isMobileOpen: boolean;
  onMobileClose: () => void;
}

export function Sidebar({ isCollapsed, onToggle, isMobileOpen, onMobileClose }: SidebarProps) {
  const { t, i18n } = useTranslation();
  const { user, logout } = useAuth();
  const location = useLocation();

  const filteredNavItems = moduleNavItems
    .filter((item) => user && item.roles.includes(user.role))
    .map((item) => ({ ...item, label: t(item.labelKey) }));

  const NavContent = ({ collapsed = isCollapsed }: { collapsed?: boolean }) => (
    <>
      <div className="flex items-center justify-between border-b border-sidebar-border/80 p-3 pe-12 lg:pe-3">
        <div className={cn('flex min-w-0 items-center gap-3', collapsed && 'justify-center')}>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-sidebar-border bg-background/70 shadow-sm">
            <img
              src="/image.png"
              alt="Ponts per la Pau"
              className="h-8 w-8 object-contain"
            />
          </div>
          {!collapsed && (
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-semibold text-sidebar-foreground">{t('app.name')}</span>
              <span className="truncate text-xs text-muted-foreground">{t('app.tagline')}</span>
            </div>
          )}
        </div>
        {!collapsed && (
          <Button variant="ghost" size="icon" onClick={onToggle} className="hidden lg:flex" aria-label="Collapse navigation">
            <ChevronLeft className="h-4 w-4" />
          </Button>
        )}
        {collapsed && (
          <Button variant="ghost" size="icon" onClick={onToggle} className="hidden lg:flex" aria-label="Expand navigation">
            <ChevronRight className="h-4 w-4" />
          </Button>
        )}
      </div>

      <ScrollArea className="flex-1 min-h-0 py-4">
        <nav className="space-y-1 px-2">
          {filteredNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = item.path === '/'
              ? location.pathname === '/'
              : location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);
            
            const navLink = (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={onMobileClose}
                title={collapsed ? item.label : undefined}
                className={cn(
                  'group relative flex min-h-10 items-center gap-3 overflow-hidden rounded-md px-3 py-2 text-sm font-medium transition-all duration-200',
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground shadow-sm'
                    : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground',
                  collapsed && 'justify-center px-2'
                )}
              >
                {isActive && (
                  <span className="absolute inset-y-2 start-1 w-1 rounded-full bg-sidebar-primary" />
                )}
                <Icon className={cn('h-5 w-5 flex-shrink-0 transition-transform duration-200 group-hover:scale-105', isActive && 'text-sidebar-primary')} />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </NavLink>
            );

            if (!collapsed) return navLink;

            return (
              <Tooltip key={item.id}>
                <TooltipTrigger asChild>{navLink}</TooltipTrigger>
                <TooltipContent side={i18n.dir() === 'rtl' ? 'left' : 'right'} sideOffset={8}>
                  {item.label}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </nav>
      </ScrollArea>

      <div className="border-t border-sidebar-border/80 p-3">
        <Button
          variant="ghost"
          className={cn(
            'w-full flex items-center gap-3 text-sidebar-foreground/70 hover:text-sidebar-foreground',
            collapsed && 'justify-center px-2'
          )}
          onClick={logout}
        >
          <LogOut className="h-5 w-5 flex-shrink-0" />
          {!collapsed && <span>{t('nav.logout')}</span>}
        </Button>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile Sidebar */}
      <Sheet open={isMobileOpen} onOpenChange={onMobileClose}>
        <SheetContent side={i18n.dir() === 'rtl' ? 'right' : 'left'} className="w-[min(18rem,calc(100vw-1.25rem))] border-sidebar-border bg-sidebar p-0 pb-[env(safe-area-inset-bottom)] text-sidebar-foreground">
          <VisuallyHidden>
            <SheetTitle>Navigation Menu</SheetTitle>
            <SheetDescription>Navigate to different sections of the application</SheetDescription>
          </VisuallyHidden>
          <div className="flex flex-col h-full">
            <NavContent collapsed={false} />
          </div>
        </SheetContent>
      </Sheet>

      {/* Desktop Sidebar */}
      <aside
        className={cn(
          'hidden h-dvh flex-col border-e border-sidebar-border bg-sidebar/95 text-sidebar-foreground shadow-[8px_0_30px_hsl(222_47%_11%_/_0.04)] backdrop-blur-xl transition-[width,background-color,border-color] duration-300 ease-out lg:flex',
          isCollapsed ? 'w-16' : 'w-64'
        )}
      >
        <NavContent collapsed={isCollapsed} />
      </aside>
    </>
  );
}

export function MobileMenuButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="ghost" size="icon" className="size-10 lg:hidden" onClick={onClick} aria-label="Open navigation">
      <Menu className="h-5 w-5" />
    </Button>
  );
}

const MOBILE_NAV_PRIORITY: Record<string, string[]> = {
  superadmin: ['dashboard.nav', 'students.nav', 'attendance.nav', 'messages.nav'],
  admin: ['dashboard.nav', 'students.nav', 'attendance.nav', 'messages.nav'],
  teacher: ['dashboard.nav', 'students.nav', 'attendance.nav', 'grades.nav'],
  librarian: ['dashboard.nav', 'library.nav', 'messages.nav', 'profile.nav'],
  student: ['dashboard.nav', 'students.myProfile.nav', 'classes.nav', 'calendar.nav'],
  parent: ['parents.portal.nav'],
};

export function MobileBottomNav({ onMoreClick }: { onMoreClick: () => void }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const location = useLocation();

  if (!user) return null;

  const accessibleItems = moduleNavItems.filter((item) => item.roles.includes(user.role));
  const priorities = MOBILE_NAV_PRIORITY[user.role] ?? [];
  const primaryItems = priorities
    .map((id) => accessibleItems.find((item) => item.id === id))
    .filter((item): item is (typeof accessibleItems)[number] => Boolean(item))
    .slice(0, 4);
  const primaryPaths = new Set(primaryItems.map((item) => item.path));
  const isMoreActive = accessibleItems.some((item) => {
    if (primaryPaths.has(item.path)) return false;
    return item.path === '/'
      ? location.pathname === '/'
      : location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);
  });

  return (
    <nav
      aria-label={t('nav.mobileNavigation')}
      className="fixed inset-x-0 bottom-0 z-40 grid min-h-16 border-t border-border/70 bg-background/92 px-2 pb-[env(safe-area-inset-bottom)] shadow-[0_-12px_32px_hsl(222_47%_11%_/_0.08)] backdrop-blur-xl lg:hidden"
      style={{ gridTemplateColumns: `repeat(${primaryItems.length + 1}, minmax(0, 1fr))` }}
    >
      {primaryItems.map((item) => {
        const Icon = item.icon;
        const active = item.path === '/'
          ? location.pathname === '/'
          : location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);
        return (
          <NavLink
            key={item.id}
            to={item.path}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'relative flex min-h-16 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[11px] font-medium text-muted-foreground transition-colors',
              active && 'text-primary',
            )}
          >
            {active && <span className="absolute inset-x-4 top-1 h-0.5 rounded-full bg-primary" />}
            <Icon className={cn('h-5 w-5', active && 'stroke-[2.4]')} />
            <span className="max-w-full truncate">{t(item.labelKey)}</span>
          </NavLink>
        );
      })}
      <button
        type="button"
        onClick={onMoreClick}
        className={cn(
          'relative flex min-h-16 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[11px] font-medium text-muted-foreground transition-colors',
          isMoreActive && 'text-primary',
        )}
        aria-label={t('nav.more')}
      >
        {isMoreActive && <span className="absolute inset-x-4 top-1 h-0.5 rounded-full bg-primary" />}
        <MoreHorizontal className="h-5 w-5" />
        <span>{t('nav.more')}</span>
      </button>
    </nav>
  );
}
