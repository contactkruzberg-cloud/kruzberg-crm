'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Calendar, ListTodo, Radar, type LucideIcon } from 'lucide-react';
import { useDeals } from '@/hooks/use-deals';
import { useTasks } from '@/hooks/use-tasks';
import { useRadar } from '@/hooks/use-radar';
import { usePipelineFilters } from '@/components/pipeline/pipeline-filters';
import { baseSet, triQueue } from '@/lib/radar/logic';
import { Skeleton } from '@/components/ui/skeleton';
import { cn, daysUntil, dealLabel, formatDate } from '@/lib/utils';

const CLOSED = ['confirme', 'termine', 'refuse'];

type Tone = 'alert' | 'warn' | 'ok' | 'info';
const TONE: Record<Tone, string> = {
  alert: 'border-red-500/40 bg-red-500/5 text-red-500',
  warn: 'border-orange-500/40 bg-orange-500/5 text-orange-500',
  ok: 'border-border bg-card text-muted-foreground',
  info: 'border-primary/40 bg-primary/5 text-primary',
};

function Tile({
  icon: Icon,
  label,
  value,
  sub,
  tone,
  href,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  sub: React.ReactNode;
  tone: Tone;
  href?: string;
  onClick?: () => void;
}) {
  const body = (
    <>
      <div className="flex items-center gap-1.5 text-xs font-medium">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="mt-1 truncate text-2xl font-bold tabular-nums text-foreground">{value}</div>
      <div className="truncate text-xs text-muted-foreground">{sub}</div>
    </>
  );
  const cls = cn('block rounded-xl border p-3.5 text-left transition-all hover:shadow-md hover:-translate-y-0.5', TONE[tone]);
  return href ? (
    <Link href={href} className={cls}>
      {body}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cn(cls, 'w-full')}>
      {body}
    </button>
  );
}

/** Ce qui compte aujourd'hui, en un coup d'œil : chaque case mène là où on agit. */
export function TodayStrip() {
  const router = useRouter();
  const [filters, setFilters] = usePipelineFilters();
  const { data: deals, isLoading: dealsLoading } = useDeals();
  const { data: tasks, isLoading: tasksLoading } = useTasks();
  const radar = useRadar();

  if (dealsLoading || tasksLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[92px] rounded-xl" />
        ))}
      </div>
    );
  }

  const open = (deals || []).filter((d) => !CLOSED.includes(d.stage));
  const relances = open.filter((d) => d.next_relance_at && daysUntil(d.next_relance_at) <= 0);
  const relancesLate = relances.filter((d) => daysUntil(d.next_relance_at!) < 0).length;

  const pendingTasks = (tasks || []).filter((t) => !t.completed_at);
  const lateTasks = pendingTasks.filter((t) => t.due_date && daysUntil(t.due_date) < 0).length;
  const todayTasks = pendingTasks.filter((t) => t.due_date && daysUntil(t.due_date) === 0).length;

  const radarTodo = radar.isLoading || radar.error ? null : baseSet(radar.leads, 'todo', radar.meta).length;
  const radarNew = radar.isLoading || radar.error ? 0 : triQueue(radar.leads, radar.meta, new Set()).length;

  const next = (deals || [])
    .filter((d) => d.stage === 'confirme' && d.concert_date && daysUntil(d.concert_date) >= 0)
    .sort((a, b) => a.concert_date!.localeCompare(b.concert_date!))[0];
  const nextIn = next ? daysUntil(next.concert_date!) : null;

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Tile
        icon={AlertTriangle}
        label="Relances dues"
        value={relances.length}
        sub={relances.length ? (relancesLate ? `dont ${relancesLate} en retard` : "à faire aujourd'hui") : 'rien à relancer'}
        tone={relancesLate ? 'alert' : relances.length ? 'warn' : 'ok'}
        onClick={() => {
          setFilters({ ...filters, due: true });
          router.push('/pipeline');
        }}
      />
      <Tile
        icon={ListTodo}
        label="Tâches"
        value={lateTasks + todayTasks}
        sub={
          lateTasks
            ? `${lateTasks} en retard${todayTasks ? ` · ${todayTasks} aujourd'hui` : ''}`
            : todayTasks
              ? "pour aujourd'hui"
              : `${pendingTasks.length} en cours, rien d'urgent`
        }
        tone={lateTasks ? 'alert' : todayTasks ? 'warn' : 'ok'}
        href="#taches"
      />
      <Tile
        icon={Radar}
        label="Radar"
        value={radarTodo ?? '—'}
        sub={radarTodo == null ? 'indisponible' : radarNew ? `pistes à traiter · ${radarNew} nouvelles à trier` : 'pistes à traiter'}
        tone={radarNew ? 'info' : radarTodo ? 'warn' : 'ok'}
        href="/radar"
      />
      <Tile
        icon={Calendar}
        label="Prochain concert"
        value={nextIn == null ? '—' : nextIn === 0 ? "Ce soir" : `J-${nextIn}`}
        sub={next ? `${dealLabel(next)} · ${formatDate(next.concert_date!)}` : 'aucune date confirmée'}
        tone={next ? 'info' : 'ok'}
        href={next ? `/pipeline?deal=${next.id}` : '/pipeline'}
      />
    </div>
  );
}
