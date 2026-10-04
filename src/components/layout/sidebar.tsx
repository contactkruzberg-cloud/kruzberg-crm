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
  Users,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { SettingsDialog } from '@/components/layout/settings-dialog';

export const NAV_ITEMS = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/pipeline', label: 'Pipeline', icon: Kanban },
  { href: '/tours', label: 'Tournées', icon: Route },
  { href: '/venues', label: 'Lieux & Contacts', icon: Building2 },
  { href: '/groupes', label: 'Groupes amis', icon: Users },
  { href: '/templates', label: 'Templates', icon: Mail },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { sidebarOpen, toggleSidebar, theme, setTheme, mobileNavOpen, setMobileNavOpen, settingsOpen, setSettingsOpen } =
    useAppStore();
  const supabase = createClient();
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
          'fixed left-0 top-0 z-50 flex h-screen w-64 flex-col border-r glass transition-all duration-300 md:z-40',
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
              className="flex items-center gap-2 group rounded-md -mx-1 px-1 hover:bg-accent transition-colors"
            >
              <Zap className="h-5 w-5 text-primary transition-transform group-hover:rotate-12" />
              <span className="text-lg font-bold tracking-tighter">
                <span className="text-primary">KRUZ</span>BERG
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

        <Separator />

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-1">
          {NAV_ITEMS.map((item) => {
            const isActive = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
            const Icon = item.icon;

            const link = (
              <Link
                key={item.href}
                href={item.href}
                onClick={closeMobile}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200',
                  isActive ? 'bg-primary/10 text-primary shadow-sm' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                  !expanded && 'justify-center px-0',
                )}
              >
                <Icon className={cn('h-4.5 w-4.5 shrink-0', isActive && 'text-primary')} />
                {expanded && <span>{item.label}</span>}
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
        </nav>

        <Separator />

        {/* Footer */}
        <div className="p-2 space-y-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size={expanded ? 'default' : 'icon'}
                className={cn('w-full', expanded ? 'justify-start gap-3' : '')}
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
                size={expanded ? 'default' : 'icon'}
                className={cn('w-full text-muted-foreground hover:text-destructive', expanded ? 'justify-start gap-3' : '')}
                onClick={handleLogout}
              >
                <LogOut className="h-4 w-4" />
                {expanded && 'Déconnexion'}
              </Button>
            </TooltipTrigger>
            {!expanded && <TooltipContent side="right">Déconnexion</TooltipContent>}
          </Tooltip>
        </div>
      </aside>
    </>
  );
}
