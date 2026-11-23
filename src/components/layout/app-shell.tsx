'use client';

import { useAppStore } from '@/stores/app-store';
import { cn } from '@/lib/utils';

export function AppShell({ children }: { children: React.ReactNode }) {
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);

  return (
    <main
      className={cn(
        'min-h-[calc(100vh-3.5rem)] pb-20 transition-[margin] duration-300 md:pb-0',
        sidebarOpen ? 'md:ml-60' : 'md:ml-16'
      )}
    >
      <div className="mx-auto w-full max-w-[1680px] p-3 sm:p-4 lg:px-8 lg:py-6">{children}</div>
    </main>
  );
}
