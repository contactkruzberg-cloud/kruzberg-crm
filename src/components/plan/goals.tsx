'use client';

import { useMemo, useState } from 'react';
import { Plus, Target, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmptyState } from '@/components/ui/empty-state';
import { usePlanWrite, type PlanData } from '@/hooks/use-plan';
import {
  AUTO_METRICS,
  AXES,
  GOAL_PRESETS,
  PACE_LABEL,
  autoMetric,
  axisInfo,
  currentValue,
  formatValue,
  goalPeriod,
  pace,
  type CrmData,
  type GoalPreset,
  type PaceState,
  type PlanGoal,
  type PlanReading,
} from '@/lib/plan/model';
import { cn, formatDate } from '@/lib/utils';

const STATE_COLOR: Record<PaceState, string> = {
  done: 'text-[hsl(var(--status-success))]',
  ahead: 'text-[hsl(var(--status-success))]',
  on_track: 'text-primary',
  behind: 'text-[hsl(var(--status-urgent))]',
  missed: 'text-muted-foreground',
  not_started: 'text-muted-foreground',
};

/** What it takes, in one sentence: "Encore 6 dates en 120 j (≈ 1,5 par mois)". */
function nextMove(g: PlanGoal, value: number, today: string) {
  const p = pace(g, value, today);
  if (p.state === 'done') return 'Objectif atteint';
  if (p.state === 'missed') return `Terminé le ${formatDate(goalPeriod(g).end)}`;
  const left = formatValue(p.remaining, g.unit);
  const rate = g.unit === '%' || g.metric === 'auto:cachet_moyen';
  if (rate || p.daysLeft <= 0) return `Encore ${left}`;
  const months = p.daysLeft / 30.4;
  const perMonth = months >= 1 ? ` · ≈ ${formatValue(Math.ceil((p.remaining / months) * 10) / 10, g.unit)} par mois` : '';
  return `Encore ${left} en ${p.daysLeft} j${perMonth}`;
}

function Sparkline({ points }: { points: number[] }) {
  if (points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const w = 120;
  const h = 28;
  const d = points.map((v, i) => `${(i / (points.length - 1)) * w},${h - (max === min ? h / 2 : ((v - min) / (max - min)) * (h - 4) + 2)}`).join(' ');
  return (
    <svg width={w} height={h} className="text-primary">
      <polyline points={d} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function GoalRow({ g, value, today, onOpen }: { g: PlanGoal; value: number; today: string; onOpen: () => void }) {
  const p = pace(g, value, today);
  const axis = axisInfo(g.axis);
  return (
    <button type="button" onClick={onOpen} className="grid w-full grid-cols-[1fr_auto] items-center gap-x-6 gap-y-2 px-1 py-3.5 text-left transition-colors hover:bg-secondary/60 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_7.5rem]">
      <span className="min-w-0">
        <span className="flex items-center gap-2">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: axis.color }} />
          <span className="truncate text-[14.5px] font-medium">{g.title}</span>
        </span>
        <span className="mt-0.5 block truncate pl-4 text-[12.5px] text-muted-foreground">
          {nextMove(g, value, today)}
          {g.metric.startsWith('auto:') && ' · calculé par le CRM'}
        </span>
      </span>
      <span className="order-3 col-span-2 md:order-none md:col-span-1">
        <span className="flex items-baseline justify-between gap-2 text-[12.5px]">
          <span className="font-semibold tabular-nums">{formatValue(value, g.unit)}</span>
          <span className="tabular-nums text-muted-foreground">/ {formatValue(g.target, g.unit)}</span>
        </span>
        <span className="relative mt-1 block h-1.5 overflow-hidden rounded-full bg-secondary">
          <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${p.progress * 100}%`, background: axis.color }} />
        </span>
        {p.elapsed !== null && p.state !== 'done' && p.state !== 'missed' && (
          <span className="relative block h-0">
            <span className="absolute -top-[9px] h-3 w-px bg-foreground/50" style={{ left: `${p.elapsed * 100}%` }} title="Où il faudrait en être aujourd’hui" />
          </span>
        )}
      </span>
      <span className={cn('justify-self-end text-[12.5px] font-medium md:justify-self-end', STATE_COLOR[p.state])}>{PACE_LABEL[p.state]}</span>
    </button>
  );
}

export function GoalsSection({ plan, crm, today }: { plan: PlanData; crm: CrmData; today: string }) {
  const [open, setOpen] = useState<PlanGoal | 'new' | null>(null);
  const values = useMemo(() => new Map(plan.goals.map((g) => [g.id, currentValue(g, plan.readings, crm, today)])), [plan, crm, today]);
  const byAxis = AXES.map((a) => ({ axis: a, goals: plan.goals.filter((g) => g.axis === a.key) })).filter((x) => x.goals.length);
  const behind = plan.goals.filter((g) => pace(g, values.get(g.id) ?? 0, today).state === 'behind').length;

  return (
    <section>
      <div className="mb-2 flex items-end justify-between gap-3">
        <div>
          <h2 className="text-[19px] font-semibold">Objectifs</h2>
          {plan.goals.length > 0 && (
            <p className="text-[12.5px] text-muted-foreground">
              {behind ? `${behind} en retard sur le rythme · ` : 'Tout est dans le rythme · '}
              le trait sur chaque barre montre où il faudrait en être aujourd’hui
            </p>
          )}
        </div>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setOpen('new')}>
          <Plus className="h-4 w-4" /> Objectif
        </Button>
      </div>
      {plan.goals.length === 0 ? (
        <EmptyState
          icon={Target}
          title="Fixe le cap de la saison"
          hint="Dates jouées, festivals, auditeurs, cachet moyen… Les objectifs liés au booking se calculent tout seuls depuis le CRM."
          action={<Button size="sm" onClick={() => setOpen('new')}>Choisir des objectifs</Button>}
        />
      ) : (
        <div className="space-y-5">
          {byAxis.map(({ axis, goals }) => (
            <div key={axis.key}>
              <p className="px-1 pb-1 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">{axis.label}</p>
              <div className="divide-y border-y">
                {goals.map((g) => (
                  <GoalRow key={g.id} g={g} value={values.get(g.id) ?? 0} today={today} onOpen={() => setOpen(g)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      <GoalDialog
        goal={open === 'new' ? null : open}
        open={open !== null}
        onClose={() => setOpen(null)}
        readings={plan.readings}
        value={open && open !== 'new' ? values.get(open.id) ?? 0 : 0}
        crm={crm}
        today={today}
      />
    </section>
  );
}

function defaultPeriod(today: string) {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  // From October on, plan the next season.
  return m >= 10 ? { start: `${y + 1}-01-01`, end: `${y + 1}-12-31` } : { start: `${y}-01-01`, end: `${y}-12-31` };
}

function GoalDialog({
  goal,
  open,
  onClose,
  readings,
  value,
  crm,
  today,
}: {
  goal: PlanGoal | null;
  open: boolean;
  onClose: () => void;
  readings: PlanReading[];
  value: number;
  crm: CrmData;
  today: string;
}) {
  const write = usePlanWrite();
  const [draft, setDraft] = useState<Partial<PlanGoal> | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [reading, setReading] = useState('');
  const [readingDate, setReadingDate] = useState(today);

  // Load the form when the dialog opens on another goal (during render: no effect).
  const id = open ? goal?.id ?? 'new' : null;
  if (id !== loadedFor) {
    setLoadedFor(id);
    setDraft(goal ? { ...goal } : null);
    setReading('');
    setReadingDate(today);
  }

  const pickPreset = (p: GoalPreset | null) => {
    const { start, end } = defaultPeriod(today);
    setDraft(
      p
        ? { title: p.title, axis: p.axis, metric: p.metric, unit: p.unit, target: p.target, baseline: 0, start_date: start, deadline: end }
        : { title: '', axis: 'live', metric: 'manual', unit: '', target: 10, baseline: 0, start_date: start, deadline: end },
    );
  };

  const set = (patch: Partial<PlanGoal>) => setDraft((d) => ({ ...d, ...patch }));
  const auto = draft?.metric?.startsWith('auto:');
  const mine = goal ? readings.filter((r) => r.goal_id === goal.id) : [];

  const save = () => {
    if (!draft?.title?.trim()) return toast.error('Donne un nom à l’objectif');
    const row = {
      title: draft.title.trim(),
      axis: draft.axis ?? 'live',
      metric: draft.metric ?? 'manual',
      unit: (auto ? autoMetric(draft.metric!)?.unit : draft.unit?.trim()) || null,
      baseline: Number(draft.baseline) || 0,
      target: Number(draft.target) || 0,
      start_date: draft.start_date || null,
      deadline: draft.deadline || null,
      notes: draft.notes?.trim() || null,
      updated_at: new Date().toISOString(),
    };
    if (goal) write.mutate({ op: 'update', table: 'plan_goals', id: goal.id, patch: row }, { onSuccess: onClose });
    else write.mutate({ op: 'insert', table: 'plan_goals', rows: [row] }, { onSuccess: () => (toast.success('Objectif ajouté'), onClose()) });
  };

  const addReading = () => {
    if (!goal || reading.trim() === '' || Number.isNaN(Number(reading.replace(',', '.')))) return;
    write.mutate({ op: 'insert', table: 'plan_readings', rows: [{ goal_id: goal.id, value: Number(reading.replace(',', '.')), measured_at: readingDate }] }, { onSuccess: () => setReading('') });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{goal ? goal.title : 'Nouvel objectif'}</DialogTitle>
          <DialogDescription>
            {goal ? `${formatValue(value, goal.unit)} sur ${formatValue(goal.target, goal.unit)} · ${nextMove(goal, value, today)}` : 'Un chiffre, une échéance. Le CRM calcule ce qu’il peut.'}
          </DialogDescription>
        </DialogHeader>

        {!draft ? (
          <div className="space-y-3">
            <div className="divide-y border-y">
              {GOAL_PRESETS.map((p) => (
                <button key={p.title} type="button" onClick={() => pickPreset(p)} className="flex w-full items-center gap-2.5 px-1 py-2.5 text-left hover:bg-secondary/60">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: axisInfo(p.axis).color }} />
                  <span className="flex-1 text-[14px]">{p.title}</span>
                  <span className="text-[12px] text-muted-foreground">{p.metric.startsWith('auto:') ? 'automatique' : 'relevé à la main'}</span>
                </button>
              ))}
            </div>
            <Button variant="outline" className="w-full" onClick={() => pickPreset(null)}>
              Objectif personnalisé
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Objectif</Label>
              <Input value={draft.title ?? ''} onChange={(e) => set({ title: e.target.value })} placeholder="Ex. Jouer 20 dates" autoFocus={!goal} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Axe</Label>
                <Select value={draft.axis ?? 'live'} onValueChange={(v) => set({ axis: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AXES.map((a) => (
                      <SelectItem key={a.key} value={a.key}>
                        {a.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Mesure</Label>
                <Select value={draft.metric ?? 'manual'} onValueChange={(v) => set({ metric: v, unit: autoMetric(v)?.unit ?? draft.unit, axis: autoMetric(v)?.axis ?? draft.axis })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Relevé à la main</SelectItem>
                    {AUTO_METRICS.map((m) => (
                      <SelectItem key={m.key} value={m.key}>
                        {m.label} (auto)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {auto && <p className="-mt-2 text-[12px] text-muted-foreground">{autoMetric(draft.metric!)?.hint}, entre le début et l’échéance.</p>}
            <div className="grid grid-cols-3 gap-3">
              {!auto && (
                <div className="space-y-1.5">
                  <Label>Au départ</Label>
                  <Input inputMode="decimal" value={String(draft.baseline ?? 0)} onChange={(e) => set({ baseline: Number(e.target.value.replace(',', '.')) || 0 })} />
                </div>
              )}
              <div className="space-y-1.5">
                <Label>Cible</Label>
                <Input inputMode="decimal" value={String(draft.target ?? '')} onChange={(e) => set({ target: Number(e.target.value.replace(',', '.')) || 0 })} />
              </div>
              {!auto && (
                <div className="space-y-1.5">
                  <Label>Unité</Label>
                  <Input value={draft.unit ?? ''} onChange={(e) => set({ unit: e.target.value })} placeholder="abonnés" />
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Début</Label>
                <Input type="date" value={draft.start_date ?? ''} onChange={(e) => set({ start_date: e.target.value || null })} />
              </div>
              <div className="space-y-1.5">
                <Label>Échéance</Label>
                <Input type="date" value={draft.deadline ?? ''} onChange={(e) => set({ deadline: e.target.value || null })} />
              </div>
            </div>

            {goal && !auto && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Relevés</Label>
                  <Sparkline points={[Number(goal.baseline), ...mine.map((r) => r.value)]} />
                </div>
                <div className="flex gap-2">
                  <Input inputMode="decimal" value={reading} onChange={(e) => setReading(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addReading()} placeholder={`Valeur aujourd’hui (${goal.unit ?? ''})`} />
                  <Input type="date" value={readingDate} onChange={(e) => setReadingDate(e.target.value)} className="w-40" />
                  <Button variant="outline" onClick={addReading} disabled={!reading.trim()}>
                    Ajouter
                  </Button>
                </div>
                {mine.length > 0 && (
                  <div className="max-h-40 divide-y overflow-y-auto border-y text-[13px]">
                    {[...mine].reverse().map((r) => (
                      <div key={r.id} className="group flex items-center justify-between px-1 py-1.5">
                        <span className="text-muted-foreground">{formatDate(r.measured_at)}</span>
                        <span className="flex items-center gap-2">
                          <span className="tabular-nums">{formatValue(r.value, goal.unit)}</span>
                          <button type="button" onClick={() => write.mutate({ op: 'delete', table: 'plan_readings', id: r.id })} className="text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100" aria-label="Supprimer le relevé">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center justify-between gap-2 pt-1">
              {goal ? (
                <Button
                  variant="ghost"
                  className="text-muted-foreground"
                  onClick={() => write.mutate({ op: 'update', table: 'plan_goals', id: goal.id, patch: { archived_at: new Date().toISOString() } }, { onSuccess: () => (toast.success('Objectif archivé'), onClose()) })}
                >
                  Archiver
                </Button>
              ) : (
                <Button variant="ghost" onClick={() => setDraft(null)}>
                  Retour
                </Button>
              )}
              <Button onClick={save} disabled={write.isPending}>
                {goal ? 'Enregistrer' : 'Ajouter'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

