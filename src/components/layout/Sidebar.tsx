import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { VisuallyHidden } from '@/components/ui/visually-hidden';
import { LogOut, Menu, ChevronLeft, ChevronRight } from 'lucide-react';
import { moduleNavItems } from '@/modules/registry';

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

  const filteredNavItems = moduleNavItems
    .filter((item) => user && item.roles.includes(user.role))
    .map((item) => ({ ...item, label: t(item.labelKey) }));

  const NavContent = ({ collapsed = isCollapsed }: { collapsed?: boolean }) => (
    <>
      <div className="flex items-center justify-between border-b border-sidebar-border/80 p-3">
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
                <TooltipContent side="right" sideOffset={8}>
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
        <SheetContent side="left" className="w-72 border-sidebar-border bg-sidebar p-0 text-sidebar-foreground">
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
          'hidden h-screen flex-col border-r border-sidebar-border bg-sidebar/95 text-sidebar-foreground shadow-[8px_0_30px_hsl(222_47%_11%_/_0.04)] backdrop-blur-xl transition-[width,background-color,border-color] duration-300 ease-out lg:flex',
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
    <Button variant="ghost" size="icon" className="lg:hidden" onClick={onClick} aria-label="Open navigation">
      <Menu className="h-5 w-5" />
    </Button>
  );
}
