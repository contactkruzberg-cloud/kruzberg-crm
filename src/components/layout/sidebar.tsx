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
  MessageCircle,
  CalendarDays,
  Compass,
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
      { href: '/', label: 'Aujourd’hui', icon: LayoutDashboard },
      { href: '/messages', label: 'Messages', icon: MessageCircle },
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
  { title: 'Projet', items: [{ href: '/plan', label: 'Plan de route', icon: Compass }] },
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
          'material fixed left-0 top-0 z-50 flex h-screen w-64 flex-col border-r transition-[width,transform] duration-300 md:z-40',
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
              <span className="flex h-7 w-7 items-center justify-center rounded-[8px] bg-gradient-to-b from-neutral-700 to-neutral-900 text-white shadow-[0_1px_2px_hsl(0_0%_0%/0.3),inset_0_0.5px_0_hsl(0_0%_100%/0.25)] dark:from-neutral-200 dark:to-neutral-400 dark:text-neutral-900">
                <Zap className="h-[15px] w-[15px] fill-current transition-transform group-hover:rotate-12" />
              </span>
              <span className="font-display text-[15px] font-semibold tracking-[0.08em]">KRUZBERG</span>
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
            <div key={group.title ?? gi} className={cn('space-y-px', gi > 0 && 'mt-4')}>
              {group.title &&
                (expanded ? (
                  <p className="px-2.5 pb-1 text-[11px] font-semibold text-muted-foreground/80">{group.title}</p>
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
                  'relative flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13.5px] transition-colors duration-100',
                  isActive ? 'bg-secondary font-medium text-foreground dark:bg-white/10' : 'text-foreground/80 hover:bg-secondary/60',
                  !expanded && 'justify-center px-0 py-2.5',
                )}
              >
                <Icon className={cn('h-[17px] w-[17px] shrink-0 text-primary', !isActive && 'opacity-90')} strokeWidth={1.9} />
                {expanded && <span className="flex-1 truncate">{item.label}</span>}
                {badge > 0 &&
                  (expanded ? (
                    <span className="nums min-w-5 rounded-full bg-[hsl(var(--status-urgent))] px-1.5 text-center text-[11px] font-semibold leading-[18px] text-white">{badge}</span>
                  ) : (
                    <span className="absolute right-2 top-1.5 h-2 w-2 rounded-full bg-[hsl(var(--status-urgent))]" aria-label={`${badge}`} />
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
        <div className={cn('p-2', expanded ? 'flex items-center gap-1' : 'space-y-1')}>
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
