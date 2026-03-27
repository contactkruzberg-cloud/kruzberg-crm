'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/stores/app-store';
import { createClient } from '@/lib/supabase/client';
import {
  LayoutDashboard,
  Kanban,
  Building2,
  Mail,
  Target,
  BarChart3,
  Moon,
  Sun,
  LogOut,
  ChevronLeft,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const NAV_ITEMS = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/pipeline', label: 'Pipeline', icon: Kanban },
  { href: '/venues', label: 'Lieux & Contacts', icon: Building2 },
  { href: '/templates', label: 'Templates', icon: Mail },
  { href: '/focus', label: 'Focus Mode', icon: Target },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { sidebarOpen, toggleSidebar, theme, setTheme } = useAppStore();
  const supabase = createClient();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 z-40 flex h-screen flex-col border-r glass transition-all duration-300',
        sidebarOpen ? 'w-60' : 'w-16'
      )}
    >
      {/* Logo */}
      <div className="flex h-14 items-center justify-between px-4">
        {sidebarOpen && (
          <Link href="/" className="flex items-center gap-2 group">
            <Zap className="h-5 w-5 text-primary transition-transform group-hover:rotate-12" />
            <span className="text-lg font-bold tracking-tighter">
              <span className="text-primary">KRUZ</span>BERG
            </span>
          </Link>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleSidebar}
          className={cn('h-8 w-8 shrink-0', !sidebarOpen && 'mx-auto')}
        >
          <ChevronLeft
            className={cn(
              'h-4 w-4 transition-transform',
              !sidebarOpen && 'rotate-180'
            )}
          />
        </Button>
      </div>

      <Separator />

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-1">
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.href === '/'
              ? pathname === '/'
              : pathname.startsWith(item.href);
          const Icon = item.icon;

          const link = (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200',
                isActive
                  ? 'bg-primary/10 text-primary shadow-sm'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                !sidebarOpen && 'justify-center px-0'
              )}
            >
              <Icon className={cn('h-4.5 w-4.5 shrink-0', isActive && 'text-primary')} />
              {sidebarOpen && <span>{item.label}</span>}
            </Link>
          );

          if (!sidebarOpen) {
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
              size={sidebarOpen ? 'default' : 'icon'}
              className={cn('w-full', sidebarOpen ? 'justify-start gap-3' : '')}
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              {sidebarOpen && (theme === 'dark' ? 'Mode clair' : 'Mode sombre')}
            </Button>
          </TooltipTrigger>
          {!sidebarOpen && <TooltipContent side="right">Thème</TooltipContent>}
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size={sidebarOpen ? 'default' : 'icon'}
              className={cn(
                'w-full text-muted-foreground hover:text-destructive',
                sidebarOpen ? 'justify-start gap-3' : ''
              )}
              onClick={handleLogout}
            >
              <LogOut className="h-4 w-4" />
              {sidebarOpen && 'Déconnexion'}
            </Button>
          </TooltipTrigger>
          {!sidebarOpen && <TooltipContent side="right">Déconnexion</TooltipContent>}
        </Tooltip>
      </div>
    </aside>
  );
}
