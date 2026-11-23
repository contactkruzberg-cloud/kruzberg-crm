'use client';

import { usePathname } from 'next/navigation';
import { useIsMutating } from '@tanstack/react-query';
import { useAppStore, type CreateIntent } from '@/stores/app-store';
import { useSyncEmails } from '@/hooks/use-send-email';
import { useSavedAt } from '@/lib/save-status';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Search, Command, RefreshCw, Plus, Check, Loader2, Kanban, Building2, User, ListTodo, Route } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NAV_ITEMS } from './sidebar';

const CREATE_ITEMS: { kind: CreateIntent; label: string; icon: typeof Plus }[] = [
  { kind: 'deal', label: 'Opportunité', icon: Kanban },
  { kind: 'venue', label: 'Lieu / structure', icon: Building2 },
  { kind: 'contact', label: 'Contact', icon: User },
  { kind: 'task', label: 'Tâche', icon: ListTodo },
  { kind: 'tour', label: 'Tournée', icon: Route },
];

function pageTitle(pathname: string) {
  const item = [...NAV_ITEMS].reverse().find((i) => (i.href === '/' ? pathname === '/' : pathname.startsWith(i.href)));
  return item?.label ?? '';
}

/** "Enregistrement…" while an inline edit is saving, then "Enregistré ✓" fading out. */
function SaveIndicator() {
  const saving = useIsMutating({ predicate: (m) => !!m.meta?.saveIndicator });
  const savedAt = useSavedAt();
  if (saving) {
    return (
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Enregistrement…
      </span>
    );
  }
  if (!savedAt) return null;
  return (
    <span key={savedAt} className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 animate-fade-out-late">
      <Check className="h-3 w-3" /> Enregistré
    </span>
  );
}

export function Header() {
  const pathname = usePathname();
  const { sidebarOpen, setCommandPaletteOpen, openCreate } = useAppStore();
  const syncEmails = useSyncEmails();

  return (
    <header
      className={cn(
        'material-bar sticky top-0 z-30 flex h-14 items-center justify-between gap-2 border-b px-3 transition-[margin] duration-300 sm:px-4 lg:px-8',
        sidebarOpen ? 'md:ml-60' : 'md:ml-16',
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        <h1 className="font-display truncate text-[17px] font-semibold md:hidden">{pageTitle(pathname)}</h1>
        <SaveIndicator />
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" className="gap-1.5 h-9">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Nouveau</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {CREATE_ITEMS.map(({ kind, label, icon: Icon }) => (
              <DropdownMenuItem key={kind} onClick={() => openCreate(kind)} className="gap-2">
                <Icon className="h-4 w-4" /> {label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" onClick={() => syncEmails.mutate()} disabled={syncEmails.isPending} className="h-9 w-9">
              <RefreshCw className={cn('h-4 w-4', syncEmails.isPending && 'animate-spin')} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Synchroniser les emails</TooltipContent>
        </Tooltip>

        <Button
          variant="outline"
          className="hidden h-9 w-60 items-center gap-2 rounded-[10px] border-transparent bg-secondary px-3 text-muted-foreground hover:bg-secondary/70 lg:flex"
          onClick={() => setCommandPaletteOpen(true)}
        >
          <Search className="h-4 w-4" />
          <span className="text-sm">Rechercher...</span>
          <kbd className="pointer-events-none ml-auto inline-flex h-5 select-none items-center gap-0.5 rounded-md px-1 font-sans text-[11px] font-medium text-muted-foreground/80">
            <Command className="h-3 w-3" />K
          </kbd>
        </Button>
        <Button variant="ghost" size="icon" className="lg:hidden h-9 w-9" onClick={() => setCommandPaletteOpen(true)} title="Rechercher">
          <Search className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
