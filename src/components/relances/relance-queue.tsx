'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { AlarmClock, ArrowRight, CheckCircle2, ExternalLink, Loader2, Send, SkipForward, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { canQuickRelance, useDeals, useSnoozeRelance } from '@/hooks/use-deals';
import { useRelanceDocs, useRequestRelance, useRequestRelances } from '@/hooks/use-relance';
import { freshDraft, RelanceBasis, RelanceEditor } from '@/components/pipeline/relance-dialog';
import { cn, daysUntil, dealLabel, formatDate } from '@/lib/utils';
import type { RelanceDoc } from '@/lib/relance/prompt';
import type { Deal } from '@/types/database';
import { PageHeader } from '@/components/layout/page-header';

type Status = 'ready' | 'writing' | 'error' | 'todo';

const STATUS: Record<Status, { label: string; cls: string }> = {
  ready: { label: 'Prête', cls: 'bg-green-500/15 text-green-600 dark:text-green-400' },
  writing: { label: 'Rédaction…', cls: 'bg-primary/10 text-primary' },
  error: { label: 'Erreur', cls: 'bg-red-500/15 text-red-500' },
  todo: { label: 'À préparer', cls: 'bg-muted text-muted-foreground' },
};

function statusOf(doc: RelanceDoc | undefined, deal: Deal): Status {
  if (freshDraft(doc, deal)) return 'ready';
  if (doc?.state === 'requested') return 'writing';
  if (doc?.state === 'error') return 'error';
  return 'todo';
}

const late = (d: Deal) => {
  const n = daysUntil(d.next_relance_at!);
  return n < 0 ? `${-n} j de retard` : "aujourd'hui";
};

/**
 * File de relances : toutes les relances dues, brouillons préparés par Claude en
 * une fois, puis on les passe une à une (relire, envoyer depuis Mail, noter).
 */
export function RelanceQueue() {
  const { data: deals, isLoading } = useDeals();
  const docs = useRelanceDocs();
  const requestAll = useRequestRelances();
  const requestOne = useRequestRelance();
  const snooze = useSnoozeRelance();
  const [pickedId, setPickedId] = useState<string | null>(null);

  const queue = useMemo(
    () =>
      (deals || [])
        .filter((d) => canQuickRelance(d) && d.stage !== 'a_contacter' && d.next_relance_at && daysUntil(d.next_relance_at) <= 0)
        .sort((a, b) => a.next_relance_at!.localeCompare(b.next_relance_at!)),
    [deals],
  );
  const soon = useMemo(
    () => (deals || []).filter((d) => canQuickRelance(d) && d.stage !== 'a_contacter' && d.next_relance_at && [1, 2, 3].includes(daysUntil(d.next_relance_at))).length,
    [deals],
  );

  const status = (d: Deal) => statusOf(docs.data?.get(d.id), d);
  const toPrepare = queue.filter((d) => ['todo', 'error'].includes(status(d)));
  const counts = queue.reduce((acc, d) => ({ ...acc, [status(d)]: (acc[status(d)] ?? 0) + 1 }), {} as Partial<Record<Status, number>>);

  const current = queue.find((d) => d.id === pickedId) ?? queue[0] ?? null;
  const idx = current ? queue.indexOf(current) : -1;
  const next = () => setPickedId(queue[idx + 1]?.id ?? queue.find((d) => d.id !== current?.id)?.id ?? null);

  const prepareAll = () =>
    requestAll.mutate(
      toPrepare.map((d) => d.id),
      {
        onSuccess: (r) => toast.success(`${r.length} relance${r.length > 1 ? 's' : ''} en rédaction : compte 2 à 4 min chacune`),
        onError: (e) => toast.error(e.message),
      },
    );

  if (isLoading || docs.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Send}
        title="File de relances"
        description={
          <>
            {queue.length
              ? `${queue.length} relance${queue.length > 1 ? 's' : ''} due${queue.length > 1 ? 's' : ''}` +
                (counts.ready ? ` · ${counts.ready} prête${counts.ready > 1 ? 's' : ''}` : '') +
                (counts.writing ? ` · ${counts.writing} en rédaction` : '')
              : 'Rien à relancer aujourd’hui.'}
            {soon > 0 && ` · ${soon} autre${soon > 1 ? 's' : ''} dans les 3 jours`}
          </>
        }
        actions={
          <>
        {toPrepare.length > 0 && (
          <Button onClick={prepareAll} disabled={requestAll.isPending} className="gap-1.5">
            {requestAll.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Préparer {toPrepare.length === queue.length ? 'toutes les relances' : `les ${toPrepare.length} restantes`} ({toPrepare.length})
          </Button>
        )}
          </>
        }
      />

      {!queue.length ? (
        <div className="rounded-xl border border-dashed py-16 text-center">
          <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-green-500" />
          <p className="font-medium">Toutes les relances sont à jour.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {soon ? `Prochaines dans les 3 jours : ${soon}.` : 'Rien de prévu dans les 3 prochains jours.'}{' '}
            <Link href="/pipeline" className="text-primary hover:underline">
              Voir le pipeline
            </Link>
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[18rem_minmax(0,1fr)]">
          {/* Queue */}
          <ol className="space-y-1.5 lg:sticky lg:top-[4.5rem] lg:self-start">
            {queue.map((d, i) => {
              const st = status(d);
              const on = d.id === current?.id;
              return (
                <li key={d.id}>
                  <button
                    type="button"
                    onClick={() => setPickedId(d.id)}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors',
                      on ? 'border-primary/50 bg-primary/5' : 'bg-card hover:border-primary/30',
                    )}
                  >
                    <span className="w-5 shrink-0 text-xs tabular-nums text-muted-foreground">{i + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{dealLabel(d, 'Lieu inconnu')}</span>
                      <span className={cn('block text-xs', daysUntil(d.next_relance_at!) < 0 ? 'text-red-500' : 'text-muted-foreground')}>{late(d)}</span>
                    </span>
                    <span className={cn('flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium', STATUS[st].cls)}>
                      {st === 'writing' && <Loader2 className="h-3 w-3 animate-spin" />}
                      {STATUS[st].label}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>

          {/* Current follow-up */}
          {current && (
            <section className="space-y-4 rounded-xl border bg-card p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">
                    {idx + 1} / {queue.length}
                  </p>
                  <h2 className="truncate text-lg font-semibold">{dealLabel(current, 'Lieu inconnu')}</h2>
                  <p className="text-xs text-muted-foreground">
                    {[current.contact?.name, current.venue?.city].filter(Boolean).join(' · ')}
                    {current.last_message_at && ` · dernier échange le ${formatDate(current.last_message_at)}`}
                    {` · relance prévue ${current.next_relance_at ? formatDate(current.next_relance_at) : ''}`}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Button asChild variant="ghost" size="sm" className="h-8 gap-1 text-xs">
                    <Link href={`/pipeline?deal=${current.id}`}>
                      <ExternalLink className="h-3.5 w-3.5" /> Fiche
                    </Link>
                  </Button>
                  {[3, 7].map((n) => (
                    <Button
                      key={n}
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1 text-xs"
                      disabled={snooze.isPending}
                      onClick={() => snooze.mutate({ dealId: current.id, days: n }, { onSuccess: next })}
                    >
                      <AlarmClock className="h-3.5 w-3.5" /> +{n} j
                    </Button>
                  ))}
                  {queue.length > 1 && (
                    <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={next}>
                      <SkipForward className="h-3.5 w-3.5" /> Passer
                    </Button>
                  )}
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                <RelanceBasis deal={current} />
              </p>

              {status(current) === 'todo' ? (
                <div className="space-y-3 rounded-lg border border-dashed py-10 text-center">
                  <p className="text-sm text-muted-foreground">Pas encore de brouillon pour cette relance.</p>
                  <Button
                    className="gap-1.5"
                    disabled={requestOne.isPending}
                    onClick={() => requestOne.mutate({ dealId: current.id }, { onError: (e) => toast.error(e.message) })}
                  >
                    <Sparkles className="h-4 w-4" /> Préparer ce brouillon
                  </Button>
                </div>
              ) : (
                <RelanceEditor key={current.id} deal={current} onDone={next} />
              )}

              {status(current) === 'writing' && queue.some((d) => d.id !== current.id && status(d) === 'ready') && (
                <button
                  type="button"
                  onClick={() => setPickedId(queue.find((d) => status(d) === 'ready')!.id)}
                  className="flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  En attendant, une relance est déjà prête <ArrowRight className="h-3 w-3" />
                </button>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
