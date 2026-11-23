'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CalendarDays, Kanban, LayoutDashboard, Menu, Send } from 'lucide-react';
import { useAppStore } from '@/stores/app-store';
import { cn } from '@/lib/utils';
import { useNavBadges } from './use-nav-badges';

const TABS = [
  { href: '/', label: 'Accueil', icon: LayoutDashboard },
  { href: '/relances', label: 'Relances', icon: Send },
  { href: '/pipeline', label: 'Pipeline', icon: Kanban },
  { href: '/calendrier', label: 'Agenda', icon: CalendarDays },
];

/** Thumb-reach navigation on phones: the 4 daily pages + the full menu. */
export function MobileTabBar() {
  const pathname = usePathname();
  const setMobileNavOpen = useAppStore((s) => s.setMobileNavOpen);
  const badges = useNavBadges();

  return (
    <nav aria-label="Navigation principale" className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t bg-background/85 backdrop-blur-xl md:hidden">
      <div className="grid grid-cols-5">
        {TABS.map((t) => {
          const on = t.href === '/' ? pathname === '/' : pathname.startsWith(t.href);
          const badge = badges[t.href] ?? 0;
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={on ? 'page' : undefined}
              className={cn('relative flex flex-col items-center gap-0.5 py-2 text-[10.5px] font-medium', on ? 'text-primary' : 'text-muted-foreground')}
            >
              <span className={cn('flex h-7 w-12 items-center justify-center rounded-full transition-colors', on && 'bg-primary/12')}>
                <t.icon className="h-[19px] w-[19px]" />
              </span>
              {t.label}
              {badge > 0 && (
                <span className="nums absolute left-1/2 top-1 ml-2 min-w-4 rounded-full bg-red-500 px-1 text-center text-[10px] font-semibold leading-4 text-white">
                  {badge > 99 ? '99+' : badge}
                </span>
              )}
            </Link>
          );
        })}
        <button type="button" onClick={() => setMobileNavOpen(true)} className="flex flex-col items-center gap-0.5 py-2 text-[10.5px] font-medium text-muted-foreground">
          <span className="flex h-7 w-12 items-center justify-center">
            <Menu className="h-[19px] w-[19px]" />
          </span>
          Plus
        </button>
      </div>
    </nav>
  );
}
