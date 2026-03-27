'use client';

import { useAppStore } from '@/stores/app-store';
import { useSyncEmails } from '@/hooks/use-send-email';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Search, Command, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Header() {
  const { sidebarOpen, setCommandPaletteOpen } = useAppStore();
  const syncEmails = useSyncEmails();

  return (
    <header
      className={cn(
        'sticky top-0 z-30 flex h-14 items-center justify-between border-b glass px-4 lg:px-6 transition-all duration-300',
        sidebarOpen ? 'ml-60' : 'ml-16'
      )}
    >
      <div className="flex-1" />

      <div className="flex items-center gap-2">
        {/* Sync emails */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => syncEmails.mutate()}
              disabled={syncEmails.isPending}
              className="h-9 w-9"
            >
              <RefreshCw className={cn('h-4 w-4', syncEmails.isPending && 'animate-spin')} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Synchroniser les emails</TooltipContent>
        </Tooltip>

        {/* Search shortcut */}
        <Button
          variant="outline"
          className="hidden sm:flex items-center gap-2 text-muted-foreground h-9 px-4 w-64"
          onClick={() => setCommandPaletteOpen(true)}
        >
          <Search className="h-4 w-4" />
          <span className="text-sm">Rechercher...</span>
          <kbd className="ml-auto pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
            <Command className="h-3 w-3" />K
          </kbd>
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="sm:hidden"
          onClick={() => setCommandPaletteOpen(true)}
        >
          <Search className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
