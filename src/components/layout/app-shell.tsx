'use client';

import { useAppStore } from '@/stores/app-store';
import { cn } from '@/lib/utils';

export function AppShell({ children }: { children: React.ReactNode }) {
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);

  return (
    <main
      className={cn(
        'min-h-[calc(100vh-3.5rem)] transition-all duration-300 pt-14',
        sidebarOpen ? 'ml-60' : 'ml-16'
      )}
    >
      <div className="p-4 lg:p-6">{children}</div>
    </main>
  );
}
