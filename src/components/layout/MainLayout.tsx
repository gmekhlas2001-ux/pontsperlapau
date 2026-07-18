import { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { MobileBottomNav, Sidebar } from './Sidebar';
import { Header } from './Header';
import { cn } from '@/lib/utils';

export function MainLayout() {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const location = useLocation();

  useEffect(() => {
    // The shell owns scrolling. Reset it when the route changes so a newly
    // opened module never starts halfway down the previous screen.
    if (mainRef.current) mainRef.current.scrollTop = 0;
    setIsMobileSidebarOpen(false);
  }, [location.pathname]);

  return (
    <div className="app-shell flex h-dvh min-h-0 overflow-hidden">
      <Sidebar
        isCollapsed={isSidebarCollapsed}
        onToggle={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        isMobileOpen={isMobileSidebarOpen}
        onMobileClose={() => setIsMobileSidebarOpen(false)}
      />
      <MobileBottomNav onMoreClick={() => setIsMobileSidebarOpen(true)} />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header onMenuClick={() => setIsMobileSidebarOpen(true)} />
        
        <main
          ref={mainRef}
          id="main-content"
          className={cn(
            'app-main flex-1 overscroll-contain overflow-x-hidden overflow-y-auto px-3 pb-[calc(5.75rem+env(safe-area-inset-bottom))] pt-3 sm:px-4 sm:pb-[calc(5.75rem+env(safe-area-inset-bottom))] sm:pt-4 md:px-6 md:pb-[calc(5.75rem+env(safe-area-inset-bottom))] md:pt-6 lg:p-7'
          )}
        >
          <div key={location.pathname} className="page-enter mx-auto h-full min-h-full w-full min-w-0 max-w-[1480px]">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
