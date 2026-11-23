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
    <nav aria-label="Navigation principale" className="material-bar pb-safe fixed inset-x-0 bottom-0 z-40 border-t md:hidden">
      <div className="grid grid-cols-5">
        {TABS.map((t) => {
          const on = t.href === '/' ? pathname === '/' : pathname.startsWith(t.href);
          const badge = badges[t.href] ?? 0;
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={on ? 'page' : undefined}
              className={cn('relative flex flex-col items-center gap-0.5 pb-1.5 pt-2 text-[10px] font-medium', on ? 'text-primary' : 'text-muted-foreground')}
            >
              <span className="flex h-7 w-12 items-center justify-center">
                <t.icon className="h-[22px] w-[22px]" strokeWidth={on ? 2.2 : 1.7} />
              </span>
              {t.label}
              {badge > 0 && (
                <span className="nums absolute left-1/2 top-1 ml-2 min-w-[18px] rounded-full bg-[hsl(var(--status-urgent))] px-1 text-center text-[11px] font-semibold leading-[18px] text-white">
                  {badge > 99 ? '99+' : badge}
                </span>
              )}
            </Link>
          );
        })}
        <button type="button" onClick={() => setMobileNavOpen(true)} className="flex flex-col items-center gap-0.5 pb-1.5 pt-2 text-[10px] font-medium text-muted-foreground">
          <span className="flex h-7 w-12 items-center justify-center">
            <Menu className="h-[22px] w-[22px]" strokeWidth={1.7} />
          </span>
          Plus
        </button>
      </div>
    </nav>
  );
}
