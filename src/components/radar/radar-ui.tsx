'use client';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { chance, TIER, type Tier } from '@/lib/radar/logic';
import type { Lead } from '@/lib/radar/types';

// Small shared pieces of the radar UI.

export const TIER_STYLE: Record<Tier, string> = {
  hi: 'bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30',
  mid: 'bg-primary/15 text-primary border-primary/30',
  lo: 'bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30',
  vlo: 'bg-muted text-muted-foreground border-border',
};
export const TIER_BAR: Record<Tier, string> = {
  hi: 'bg-green-500',
  mid: 'bg-primary',
  lo: 'bg-orange-500',
  vlo: 'bg-muted-foreground/40',
};

export function ChanceBadge({ lead, className }: { lead: Lead; className?: string }) {
  const c = chance(lead);
  const [label, tier] = TIER(c.sc);
  return (
    <span
      title={`Chances réelles pour KRUZBERG : ${c.sc}/100 · ${label}\n${c.parts.map((p) => `${p[0]} ${p[1]}/100`).join(' · ')}${c.adj ? ` · ajustement ${c.adj > 0 ? '+' : ''}${c.adj}` : ''}`}
      className={cn('inline-flex items-center rounded-md border px-1.5 py-0.5 text-xs font-semibold tabular-nums', TIER_STYLE[tier], className)}
    >
      {c.sc}%
    </span>
  );
}

export function Tag({ children, tone = 'default', className, ...props }: React.HTMLAttributes<HTMLSpanElement> & { tone?: 'default' | 'new' | 'warn' | 'urgent' | 'ok' | 'muted' | 'crm' }) {
  const tones = {
    default: 'bg-secondary text-secondary-foreground',
    new: 'bg-primary text-primary-foreground',
    warn: 'bg-orange-500/15 text-orange-600 dark:text-orange-400',
    urgent: 'bg-red-500/15 text-red-600 dark:text-red-400',
    ok: 'bg-green-500/15 text-green-600 dark:text-green-400',
    muted: 'bg-muted text-muted-foreground line-through',
    crm: 'bg-primary/15 text-primary',
  };
  return (
    <span className={cn('inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap', tones[tone], className)} {...props}>
      {children}
    </span>
  );
}

export function Kpi({ value, label, sub, onClick, active, tone }: { value: number | string; label: string; sub?: string; onClick?: () => void; active?: boolean; tone?: 'urgent' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-xl border bg-card p-4 text-left transition-all hover:shadow-md hover:border-primary/40',
        active && 'border-primary/60 ring-1 ring-primary/30',
      )}
    >
      <div className={cn('text-3xl font-bold tabular-nums tracking-tight', tone === 'urgent' && Number(value) > 0 && 'text-red-500')}>{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">
        {label}
        {sub && <span className="ml-1 text-primary">{sub}</span>}
      </div>
    </button>
  );
}

export const Kbd = ({ children }: { children: React.ReactNode }) => (
  <kbd className="ml-1.5 rounded border bg-muted px-1 font-mono text-[10px] text-muted-foreground">{children}</kbd>
);

export { Badge };
