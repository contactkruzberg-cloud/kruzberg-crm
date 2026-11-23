'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/stores/app-store';
import { createClient } from '@/lib/supabase/client';
import {
  LayoutDashboard,
  Kanban,
  Route,
  Building2,
  Mail,
  BarChart3,
  Moon,
  Sun,
  LogOut,
  ChevronLeft,
  Zap,
  X,
  Radar,
  Send,
  CalendarDays,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { SettingsDialog } from '@/components/layout/settings-dialog';
import { useNavBadges } from './use-nav-badges';

export const NAV_GROUPS: { title: string | null; items: { href: string; label: string; icon: typeof LayoutDashboard }[] }[] = [
  {
    title: null,
    items: [
      { href: '/', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/relances', label: 'Relances', icon: Send },
      { href: '/calendrier', label: 'Calendrier', icon: CalendarDays },
    ],
  },
  { title: 'Prospection', items: [{ href: '/radar', label: 'Radar', icon: Radar }] },
  {
    title: 'Suivi',
    items: [
      { href: '/pipeline', label: 'Pipeline', icon: Kanban },
      { href: '/venues', label: 'Lieux & Contacts', icon: Building2 },
    ],
  },
  { title: 'Concerts', items: [{ href: '/tours', label: 'Tournées', icon: Route }] },
  {
    title: 'Outils',
    items: [
      { href: '/templates', label: 'Templates', icon: Mail },
      { href: '/analytics', label: 'Analytics', icon: BarChart3 },
    ],
  },
];
export const NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { sidebarOpen, toggleSidebar, theme, setTheme, mobileNavOpen, setMobileNavOpen, settingsOpen, setSettingsOpen } =
    useAppStore();
  const supabase = createClient();
  const badges = useNavBadges();
  // Labels: desktop when expanded; always in the mobile drawer.
  const expanded = sidebarOpen || mobileNavOpen;
  const closeMobile = () => setMobileNavOpen(false);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  return (
    <>
      {/* Mobile backdrop */}
      {mobileNavOpen && <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={closeMobile} aria-hidden />}

      <aside
        className={cn(
          'fixed left-0 top-0 z-50 flex h-screen w-64 flex-col border-r bg-card/95 backdrop-blur-xl transition-[width,transform] duration-300 md:z-40 md:bg-card/60',
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
          sidebarOpen ? 'md:w-60' : 'md:w-16',
        )}
      >
        {/* Logo: opens Réglages */}
        <div className="flex h-14 items-center justify-between px-4">
          {expanded && (
            <button
              type="button"
              onClick={() => {
                closeMobile();
                setSettingsOpen(true);
              }}
              title="Réglages et compte"
              className="group -mx-1 flex items-center gap-2.5 rounded-lg px-1 py-1 transition-colors hover:bg-accent"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-[0_0_18px_-4px_hsl(var(--primary)/0.7)]">
                <Zap className="h-4 w-4 transition-transform group-hover:rotate-12" />
              </span>
              <span className="font-display text-[17px] font-bold tracking-tight">
                KRUZ<span className="text-primary">BERG</span>
              </span>
            </button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSidebar}
            className={cn('hidden md:inline-flex h-8 w-8 shrink-0', !sidebarOpen && 'mx-auto')}
            title={sidebarOpen ? 'Replier le menu' : 'Déplier le menu'}
          >
            <ChevronLeft className={cn('h-4 w-4 transition-transform', !sidebarOpen && 'rotate-180')} />
          </Button>
          <Button variant="ghost" size="icon" onClick={closeMobile} className="md:hidden h-8 w-8" title="Fermer le menu">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-3">
          {NAV_GROUPS.map((group, gi) => (
            <div key={group.title ?? gi} className={cn('space-y-0.5', gi > 0 && 'mt-5')}>
              {group.title &&
                (expanded ? (
                  <p className="px-3 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/60">{group.title}</p>
                ) : (
                  <Separator className="mx-auto mb-2 w-8" />
                ))}
          {group.items.map((item) => {
            const isActive = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
            const Icon = item.icon;

            const badge = badges[item.href] ?? 0;
            const link = (
              <Link
                key={item.href}
                href={item.href}
                onClick={closeMobile}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150',
                  isActive ? 'bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-accent/70 hover:text-foreground',
                  !expanded && 'justify-center px-0 py-2.5',
                )}
              >
                {isActive && <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-x-2 -translate-y-1/2 rounded-r-full bg-primary" aria-hidden />}
                <Icon className={cn('h-[18px] w-[18px] shrink-0', isActive && 'text-primary')} />
                {expanded && <span className="flex-1 truncate">{item.label}</span>}
                {badge > 0 &&
                  (expanded ? (
                    <span className="nums rounded-full bg-red-500/15 px-1.5 text-[11px] font-semibold text-red-500">{badge}</span>
                  ) : (
                    <span className="absolute right-2 top-1.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-card" aria-label={`${badge}`} />
                  ))}
              </Link>
            );

            if (!expanded) {
              return (
                <Tooltip key={item.href}>
                  <TooltipTrigger asChild>{link}</TooltipTrigger>
                  <TooltipContent side="right">{item.label}</TooltipContent>
                </Tooltip>
              );
            }
            return link;
          })}
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className={cn('border-t p-2', expanded ? 'flex items-center gap-1' : 'space-y-1')}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size={expanded ? 'sm' : 'icon'}
                className={cn('text-muted-foreground', expanded ? 'flex-1 justify-start gap-2.5' : 'w-full')}
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              >
                {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                {expanded && (theme === 'dark' ? 'Mode clair' : 'Mode sombre')}
              </Button>
            </TooltipTrigger>
            {!expanded && <TooltipContent side="right">Thème</TooltipContent>}
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn('text-muted-foreground hover:text-destructive', !expanded && 'w-full')}
                onClick={handleLogout}
                aria-label="Déconnexion"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side={expanded ? 'top' : 'right'}>Déconnexion</TooltipContent>
          </Tooltip>
        </div>
      </aside>
    </>
  );
}
