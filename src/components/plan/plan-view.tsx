'use client';

import { useMemo } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { useContacts } from '@/hooks/use-contacts';
import { useDeals } from '@/hooks/use-deals';
import { isPlanSetupError, usePlan, usePlanWrite } from '@/hooks/use-plan';
import { daysBetween, isoDay, upcomingSteps, type CrmData } from '@/lib/plan/model';
import { cn } from '@/lib/utils';
import { GoalsSection } from './goals';
import { RoadmapSection } from './roadmap';

const when = (n: number) => (n < 0 ? `${-n} j de retard` : n === 0 ? 'aujourd’hui' : n === 1 ? 'demain' : `dans ${n} j`);

/** Late steps and the next two weeks, across every project. */
function NextSteps({ data, today }: { data: NonNullable<ReturnType<typeof usePlan>['data']>; today: string }) {
  const write = usePlanWrite();
  const rows = upcomingSteps(data.projects, data.steps, today, 14);
  if (!rows.length) return null;
  return (
    <section>
      <h2 className="mb-2 text-[19px] font-semibold">Les deux prochaines semaines</h2>
      <div className="divide-y border-y">
        {rows.map(({ step, project, date }) => {
          const n = daysBetween(today, date);
          return (
            <div key={step.id} className="flex items-center gap-3 px-1 py-2.5">
              <button
                type="button"
                onClick={() => write.mutate({ op: 'update', table: 'plan_steps', id: step.id, patch: { done_at: new Date().toISOString() } })}
                className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-muted-foreground/40 text-transparent hover:border-foreground hover:text-muted-foreground"
                aria-label="Marquer fait"
              >
                <Check className="h-3 w-3" strokeWidth={3} />
              </button>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14.5px]">{step.title}</span>
                <span className="block truncate text-[12.5px] text-muted-foreground">{project.title}</span>
              </span>
              <span className={cn('shrink-0 text-[12.5px] tabular-nums', n < 0 ? 'font-medium text-[hsl(var(--status-urgent))]' : n <= 2 ? 'font-medium text-[hsl(var(--status-warning))]' : 'text-muted-foreground')}>{when(n)}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function PlanView() {
  const plan = usePlan();
  const { data: deals } = useDeals();
  const { data: contacts } = useContacts();
  const today = isoDay(new Date());
  const crm = useMemo<CrmData>(() => ({ deals: deals ?? [], contacts: contacts ?? [] }), [deals, contacts]);

  return (
    <div className="mx-auto max-w-4xl space-y-10 pb-16">
      <PageHeader title="Plan de route" description="Le cap de la saison : objectifs chiffrés et projets planifiés à rebours." />
      {isPlanSetupError(plan.error) ? (
        <div className="rounded-xl border border-dashed p-6 text-[14px]">
          <p className="font-medium">Une dernière étape pour activer le plan de route</p>
          <p className="mt-1 text-muted-foreground">
            Exécute le fichier <code className="rounded bg-secondary px-1">supabase/migrations/021_contact_kind_and_plan.sql</code> dans Supabase → SQL Editor, puis recharge la page.
          </p>
        </div>
      ) : plan.isLoading || !plan.data ? (
        <div className="flex justify-center py-16 text-muted-foreground">
          {plan.error ? <p className="text-[14px]">Impossible de charger le plan : {String((plan.error as Error).message)}</p> : <Loader2 className="h-5 w-5 animate-spin" />}
        </div>
      ) : (
        <>
          <NextSteps data={plan.data} today={today} />
          <GoalsSection plan={plan.data} crm={crm} today={today} />
          <RoadmapSection plan={plan.data} today={today} />
        </>
      )}
    </div>
  );
}
