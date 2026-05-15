import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { cn } from '@/lib/utils';

export function MainLayout() {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  return (
    <div className="app-shell flex h-screen overflow-hidden">
      <Sidebar
        isCollapsed={isSidebarCollapsed}
        onToggle={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        isMobileOpen={isMobileSidebarOpen}
        onMobileClose={() => setIsMobileSidebarOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header onMenuClick={() => setIsMobileSidebarOpen(true)} />
        
        <main
          className={cn(
            'app-main flex-1 overflow-auto p-3 sm:p-4 md:p-6 lg:p-7'
          )}
        >
          <div className="page-enter mx-auto w-full max-w-[1480px]">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
