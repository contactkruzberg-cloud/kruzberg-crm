'use client';

import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster, toast } from 'sonner';
import { markSaved } from '@/lib/save-status';
import { useState, useEffect } from 'react';
import { useAppStore } from '@/stores/app-store';

function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useAppStore((s) => s.theme);

  // Restore remembered preferences (theme, sidebar) once mounted.
  useEffect(() => {
    useAppStore.persist.rehydrate();
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    if (theme === 'system') {
      const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.classList.add(systemDark ? 'dark' : 'light');
    } else {
      root.classList.add(theme);
    }
  }, [theme]);

  return <>{children}</>;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        // Inline edits (meta.saveIndicator): "Enregistré ✓" in the header, explicit error otherwise.
        mutationCache: new MutationCache({
          onSuccess: (_data, _vars, _ctx, mutation) => {
            if (mutation.meta?.saveIndicator) markSaved();
          },
          onError: (error, _vars, _ctx, mutation) => {
            if (mutation.meta?.saveIndicator) {
              toast.error(`Échec de l'enregistrement : ${error instanceof Error ? error.message : 'erreur inconnue'}`);
            }
          },
        }),
        defaultOptions: {
          queries: {
            staleTime: 30 * 1000,
            retry: 1,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ThemeProvider>
          {children}
          <Toaster
            position="bottom-right"
            toastOptions={{
              className: 'bg-card text-card-foreground border shadow-lg',
            }}
          />
        </ThemeProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
