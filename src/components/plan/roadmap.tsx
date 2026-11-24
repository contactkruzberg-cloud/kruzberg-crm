'use client';

import { useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Flag, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { usePlanWrite, type PlanData } from '@/hooks/use-plan';
import { TEMPLATES, addDays, daysBetween, jLabel, stepDate, templateInfo, type PlanProject, type PlanStep } from '@/lib/plan/model';
import { cn } from '@/lib/utils';

const PROJECT_COLORS = ['hsl(211 100% 50%)', 'hsl(340 80% 55%)', 'hsl(28 100% 50%)', 'hsl(250 70% 60%)', 'hsl(175 70% 38%)', 'hsl(140 55% 40%)'];
const shortDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
const nextMonth = (m: string) => (m.slice(5, 7) === '12' ? `${Number(m.slice(0, 4)) + 1}-01-01` : `${m.slice(0, 5)}${String(Number(m.slice(5, 7)) + 1).padStart(2, '0')}-01`);
const countdown = (n: number) => (n === 0 ? 'aujourd’hui' : n > 0 ? `dans ${n} j` : `il y a ${-n} j`);

// ---------- Frise : tous les projets sur les mois qui viennent ----------

function Timeline({ projects, steps, today, colorOf }: { projects: PlanProject[]; steps: PlanStep[]; today: string; colorOf: (id: string) => string }) {
  const range = useMemo(() => {
    const dates = projects.flatMap((p) => [p.target_date, ...steps.filter((s) => s.project_id === p.id).map((s) => stepDate(p, s))]);
    const min = [today, ...dates].sort()[0];
    const max = [addDays(today, 90), ...dates].sort().at(-1)!;
    const start = `${min.slice(0, 7)}-01`;
    const end = nextMonth(`${max.slice(0, 7)}-01`);
    const months: string[] = [];
    for (let m = start; m < end; m = nextMonth(m)) months.push(m);
    return { start, total: daysBetween(start, end), months };
  }, [projects, steps, today]);
  const x = (iso: string) => `${(daysBetween(range.start, iso) / range.total) * 100}%`;

  return (
    <div className="overflow-x-auto">
      <div className="relative" style={{ minWidth: Math.max(560, range.months.length * 70) }}>
        <div className="flex border-b text-[11.5px] text-muted-foreground">
          {range.months.map((m) => (
            <div key={m} className="border-l pl-1.5 pb-1 first:border-l-0" style={{ width: `${(daysBetween(m, nextMonth(m)) / range.total) * 100}%` }}>
              {new Date(`${m}T12:00:00`).toLocaleDateString('fr-FR', { month: 'short', ...(m.slice(5, 7) === '01' ? { year: '2-digit' } : {}) })}
            </div>
          ))}
        </div>
        <div className="relative space-y-1 py-2">
          <div className="pointer-events-none absolute inset-y-0 z-10 w-px bg-[hsl(var(--status-urgent))]" style={{ left: x(today) }} title="Aujourd’hui" />
          {projects.map((p) => {
            const mine = steps.filter((s) => s.project_id === p.id);
            const first = [p.target_date, ...mine.map((s) => stepDate(p, s))].sort()[0];
            const last = [p.target_date, ...mine.map((s) => stepDate(p, s))].sort().at(-1)!;
            const color = colorOf(p.id);
            return (
              <div key={p.id} className="relative h-7">
                <div className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full opacity-25" style={{ left: x(first), width: `calc(${x(last)} - ${x(first)})`, background: color }} />
                {mine.map((s) => (
                  <span
                    key={s.id}
                    title={`${jLabel(s.offset_days)} · ${shortDate(stepDate(p, s))} · ${s.title}`}
                    className="absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2"
                    style={{ left: x(stepDate(p, s)), borderColor: color, background: s.done_at ? color : 'hsl(var(--background))' }}
                  />
                ))}
                <span className="absolute top-1/2 flex -translate-y-1/2 items-center gap-1 whitespace-nowrap text-[12px] font-medium" style={{ left: `calc(${x(p.target_date)} - 6px)` }}>
                  <Flag className="h-3.5 w-3.5" style={{ color }} fill={color} />
                  {p.title}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------- Un projet et ses étapes ----------

function StepRow({ p, s, today, color }: { p: PlanProject; s: PlanStep; today: string; color: string }) {
  const write = usePlanWrite();
  const date = stepDate(p, s);
  const late = !s.done_at && date < today;
  const soon = !s.done_at && !late && daysBetween(today, date) <= 7;
  const [title, setTitle] = useState(s.title);
  return (
    <div className="group flex items-center gap-3 py-2">
      <button
        type="button"
        onClick={() => write.mutate({ op: 'update', table: 'plan_steps', id: s.id, patch: { done_at: s.done_at ? null : new Date().toISOString() } })}
        className={cn('flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors', s.done_at ? 'border-transparent text-white' : 'border-muted-foreground/40 hover:border-foreground')}
        style={s.done_at ? { background: color } : undefined}
        aria-label={s.done_at ? 'Marquer à faire' : 'Marquer fait'}
      >
        {s.done_at && <Check className="h-3 w-3" strokeWidth={3} />}
      </button>
      <span className="w-12 shrink-0 text-[12px] tabular-nums text-muted-foreground">{jLabel(s.offset_days)}</span>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => title.trim() && title !== s.title && write.mutate({ op: 'update', table: 'plan_steps', id: s.id, patch: { title: title.trim() } })}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        className={cn('min-w-0 flex-1 bg-transparent text-[14px] outline-none', s.done_at && 'text-muted-foreground line-through', s.offset_days === 0 && 'font-semibold')}
      />
      {s.phase && <span className="hidden shrink-0 text-[12px] text-muted-foreground sm:inline">{s.phase}</span>}
      <label className={cn('relative shrink-0 cursor-pointer text-right text-[12.5px] tabular-nums', late ? 'font-medium text-[hsl(var(--status-urgent))]' : soon ? 'font-medium text-[hsl(var(--status-warning))]' : 'text-muted-foreground')}>
        {shortDate(date)}
        <input
          type="date"
          value={date}
          onChange={(e) => e.target.value && write.mutate({ op: 'update', table: 'plan_steps', id: s.id, patch: { offset_days: daysBetween(p.target_date, e.target.value) } })}
          className="absolute inset-0 cursor-pointer opacity-0"
          aria-label="Changer la date"
        />
      </label>
      <button type="button" onClick={() => write.mutate({ op: 'delete', table: 'plan_steps', id: s.id })} className="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100" aria-label="Supprimer l’étape">
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function ProjectBlock({ p, steps, today, color, defaultOpen }: { p: PlanProject; steps: PlanStep[]; today: string; color: string; defaultOpen: boolean }) {
  const write = usePlanWrite();
  const [open, setOpen] = useState(defaultOpen);
  const [newStep, setNewStep] = useState('');
  const [newDate, setNewDate] = useState('');
  const sorted = [...steps].sort((a, b) => a.offset_days - b.offset_days);
  const done = steps.filter((s) => s.done_at).length;
  const late = steps.filter((s) => !s.done_at && stepDate(p, s) < today).length;
  const next = sorted.find((s) => !s.done_at);
  const tpl = templateInfo(p.template);
  const left = daysBetween(today, p.target_date);

  const moveTarget = (d: string) => {
    if (!d || d === p.target_date) return;
    write.mutate({ op: 'update', table: 'plan_projects', id: p.id, patch: { target_date: d, updated_at: new Date().toISOString() } }, { onSuccess: () => toast.success('Toutes les étapes ont suivi la nouvelle date') });
  };
  const addStep = () => {
    if (!newStep.trim()) return;
    write.mutate({ op: 'insert', table: 'plan_steps', rows: [{ project_id: p.id, title: newStep.trim(), offset_days: newDate ? daysBetween(p.target_date, newDate) : 0 }] }, { onSuccess: () => (setNewStep(''), setNewDate('')) });
  };

  return (
    <div className="py-1">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center gap-3 py-3 text-left">
        <span className="h-9 w-1 shrink-0 rounded-full" style={{ background: color }} />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className="truncate text-[16px] font-semibold">{p.title}</span>
            <span className="shrink-0 text-[12.5px] text-muted-foreground">
              {tpl?.target ?? 'Date cible'} {shortDate(p.target_date)} · {countdown(left)}
            </span>
          </span>
          <span className="block truncate text-[12.5px] text-muted-foreground">
            {late > 0 && <span className="font-medium text-[hsl(var(--status-urgent))]">{late} en retard · </span>}
            {next ? `Prochaine étape : ${next.title} (${shortDate(stepDate(p, next))})` : steps.length ? 'Toutes les étapes sont faites' : 'Aucune étape'}
          </span>
        </span>
        <span className="hidden shrink-0 text-[12.5px] tabular-nums text-muted-foreground sm:block">
          {done}/{steps.length}
        </span>
        {open ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
      </button>
      {open && (
        <div className="mb-3 ml-4 border-l pl-4">
          <div className="divide-y">
            {sorted.map((s) => (
              <StepRow key={s.id} p={p} s={s} today={today} color={color} />
            ))}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Input value={newStep} onChange={(e) => setNewStep(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addStep()} placeholder="Ajouter une étape" className="h-8 min-w-[12rem] flex-1 text-[13.5px]" />
            <Input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="h-8 w-40 text-[13px]" title="Date (sinon le jour J)" />
            <Button size="sm" variant="outline" onClick={addStep} disabled={!newStep.trim()}>
              Ajouter
            </Button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[12.5px] text-muted-foreground">
            <label className="flex items-center gap-2">
              Déplacer le jour J
              <Input type="date" defaultValue={p.target_date} onBlur={(e) => moveTarget(e.target.value)} className="h-7 w-40 text-[12.5px]" />
            </label>
            <button
              type="button"
              className="hover:text-foreground"
              onClick={() => write.mutate({ op: 'update', table: 'plan_projects', id: p.id, patch: { archived_at: new Date().toISOString() } }, { onSuccess: () => toast.success('Projet archivé') })}
            >
              Archiver le projet
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Nouveau projet ----------

function NewProjectDialog({ open, onClose, today }: { open: boolean; onClose: () => void; today: string }) {
  const write = usePlanWrite();
  const [tplKey, setTplKey] = useState<string>('sortie');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const tpl = templateInfo(tplKey);

  const create = async () => {
    if (!title.trim() || !date) return toast.error('Un nom et une date cible');
    const [proj] = await write.mutateAsync({ op: 'insert', table: 'plan_projects', rows: [{ title: title.trim(), template: tpl?.key ?? null, target_date: date }] });
    if (proj && tpl?.steps.length) await write.mutateAsync({ op: 'insert', table: 'plan_steps', rows: tpl.steps.map((s) => ({ project_id: proj.id, title: s.title, phase: s.phase, offset_days: s.offset })) });
    const first = tpl?.steps[0] ? addDays(date, tpl.steps[0].offset) : null;
    toast.success(first && first < today ? `Projet créé : certaines étapes sont déjà en retard (dès le ${shortDate(first)})` : 'Projet créé');
    setTitle('');
    setDate('');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nouveau projet</DialogTitle>
          <DialogDescription>Choisis un modèle : les étapes se placent toutes seules en remontant depuis la date cible.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="divide-y border-y">
            {[...TEMPLATES, { key: 'vide', label: 'Projet vide', target: 'Date cible', hint: 'Tu ajoutes tes propres étapes', steps: [] }].map((t) => (
              <button key={t.key} type="button" onClick={() => setTplKey(t.key)} className="flex w-full items-center gap-3 px-1 py-2.5 text-left hover:bg-secondary/60">
                <span className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-[1.5px]', tplKey === t.key ? 'border-primary bg-primary' : 'border-muted-foreground/40')}>
                  {tplKey === t.key && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-medium">{t.label}</span>
                  <span className="block text-[12px] text-muted-foreground">
                    {t.hint}
                    {t.steps.length ? ` · ${t.steps.length} étapes dès ${jLabel(t.steps[0].offset)}` : ''}
                  </span>
                </span>
              </button>
            ))}
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <div className="space-y-1.5">
              <Label>Nom</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={tplKey === 'tournee' ? 'Tournée printemps' : tplKey === 'aide' ? 'Aide CNM' : 'Nom du projet'} />
            </div>
            <div className="space-y-1.5">
              <Label>{tpl?.target ?? 'Date cible'}</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Annuler
            </Button>
            <Button onClick={create} disabled={write.isPending || !title.trim() || !date}>
              Créer le rétroplanning
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function RoadmapSection({ plan, today }: { plan: PlanData; today: string }) {
  const [creating, setCreating] = useState(false);
  const projects = plan.projects;
  const colorOf = (id: string) => PROJECT_COLORS[Math.max(0, projects.findIndex((p) => p.id === id)) % PROJECT_COLORS.length];
  // The next project to land is open by default.
  const nextId = projects.find((p) => p.target_date >= today)?.id ?? projects[0]?.id;

  return (
    <section>
      <div className="mb-2 flex items-end justify-between gap-3">
        <div>
          <h2 className="text-[19px] font-semibold">Rétroplanning</h2>
          {projects.length > 0 && <p className="text-[12.5px] text-muted-foreground">Chaque étape est placée à J-x de la date cible : déplacer le jour J déplace tout.</p>}
        </div>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> Projet
        </Button>
      </div>
      {projects.length === 0 ? (
        <EmptyState
          icon={Flag}
          title="Planifie à rebours"
          hint="Sortie d’EP, tournée, candidature, demande d’aide, clip, résidence : choisis une date cible, le CRM pose les étapes."
          action={<Button size="sm" onClick={() => setCreating(true)}>Créer un projet</Button>}
        />
      ) : (
        <>
          <Timeline projects={projects} steps={plan.steps} today={today} colorOf={colorOf} />
          <div className="mt-2 divide-y border-y">
            {projects.map((p) => (
              <ProjectBlock key={p.id} p={p} steps={plan.steps.filter((s) => s.project_id === p.id)} today={today} color={colorOf(p.id)} defaultOpen={p.id === nextId} />
            ))}
          </div>
        </>
      )}
      <NewProjectDialog open={creating} onClose={() => setCreating(false)} today={today} />
    </section>
  );
}
