'use client';

import Link from 'next/link';
import { useDeals } from '@/hooks/use-deals';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { STAGES } from '@/types/database';
import { cn } from '@/lib/utils';

const BAR: Record<string, string> = {
  a_contacter: 'bg-slate-400',
  contacte: 'bg-blue-500',
  relance: 'bg-orange-500',
  repondu: 'bg-violet-500',
  a_suivre: 'bg-amber-400',
  confirme: 'bg-green-500',
  termine: 'bg-emerald-700',
  refuse: 'bg-red-500/70',
};

/** Le pipeline en une barre : combien d'opportunités à chaque étape, et les taux qui comptent. */
export function KpiCards() {
  const { data: deals, isLoading } = useDeals();

  if (isLoading) return <Skeleton className="h-40 rounded-xl" />;

  const all = deals || [];
  const by = Object.fromEntries(STAGES.map((s) => [s.key, all.filter((d) => d.stage === s.key).length]));
  const total = all.length;
  // Écrits = tout ce qui a dépassé « à contacter ».
  const written = total - by.a_contacter;
  const answered = by.repondu + by.a_suivre + by.confirme + by.termine + by.refuse;
  const won = by.confirme + by.termine;
  const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)} %` : '—');

  const rates = [
    { label: 'Lieux écrits', value: written, hint: `${by.a_contacter} encore à contacter` },
    { label: 'Taux de réponse', value: pct(answered, written), hint: `${answered} réponses sur ${written}` },
    { label: 'Dates obtenues', value: won, hint: `${pct(won, written)} des lieux écrits` },
    { label: 'En attente de réponse', value: by.contacte + by.relance, hint: `dont ${by.relance} relancés` },
  ];

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {rates.map((r) => (
            <div key={r.label}>
              <p className="text-xs text-muted-foreground">{r.label}</p>
              <p className="text-2xl font-bold tabular-nums">{r.value}</p>
              <p className="text-[11px] text-muted-foreground">{r.hint}</p>
            </div>
          ))}
        </div>

        {total > 0 && (
          <div className="space-y-2">
            <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
              {STAGES.filter((s) => by[s.key]).map((s) => (
                <div key={s.key} className={BAR[s.key]} style={{ width: `${(by[s.key] / total) * 100}%` }} title={`${s.label} : ${by[s.key]}`} />
              ))}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {STAGES.map((s) => (
                <Link key={s.key} href="/pipeline" className={cn('flex items-center gap-1.5 text-xs hover:text-foreground', by[s.key] ? 'text-muted-foreground' : 'text-muted-foreground/50')}>
                  <span className={cn('h-2 w-2 rounded-full', BAR[s.key])} />
                  {s.label} <span className="tabular-nums font-medium text-foreground">{by[s.key]}</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
