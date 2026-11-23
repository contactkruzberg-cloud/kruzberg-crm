'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Check, ChevronRight, Plus } from 'lucide-react';
import { useDeals } from '@/hooks/use-deals';
import { useCreateTask, useTasks, useUpdateTask } from '@/hooks/use-tasks';
import { useVenues } from '@/hooks/use-venues';
import { useRadar } from '@/hooks/use-radar';
import { useContacts } from '@/hooks/use-contacts';
import { useEmails } from '@/hooks/use-emails';
import { buildConversations } from '@/lib/email/messages';
import { applicationWindow } from '@/lib/application-dates';
import { triQueue } from '@/lib/radar/logic';
import { cn, daysUntil, dealLabel } from '@/lib/utils';
import type { Task } from '@/types/task';

// "Aujourd'hui": one list of what needs doing, most urgent first. Every row
// says what to do and opens the place where it is done. Nothing else.

type Level = 'late' | 'today' | 'soon' | 'info';

interface Row {
  key: string;
  level: Level;
  title: string;
  detail?: string;
  meta: string;
  href?: string;
  task?: Task;
}

const DOT: Record<Level, string> = {
  late: 'bg-[hsl(var(--status-urgent))]',
  today: 'bg-[hsl(var(--status-warning))]',
  soon: 'bg-primary',
  info: 'bg-muted-foreground/40',
};
const RANK: Record<Level, number> = { late: 0, today: 1, soon: 2, info: 3 };
const CLOSED = ['a_contacter', 'confirme', 'termine', 'refuse'];

const inDays = (n: number) => (n === 0 ? "aujourd'hui" : n === 1 ? 'demain' : n < 0 ? `${-n} j de retard` : `dans ${n} j`);

function useTodayRows() {
  const { data: deals } = useDeals();
  const { data: tasks } = useTasks();
  const { data: venues } = useVenues();
  const radar = useRadar();
  const { data: emails } = useEmails();
  const { data: contacts } = useContacts();

  return useMemo(() => {
    const rows: Row[] = [];

    // Unread mail from people the CRM knows.
    const unread = buildConversations((emails ?? []).filter((e) => e.direction === 'in' && !e.seen), venues ?? [], contacts ?? []).filter((c) => c.kind !== 'address');
    if (unread.length)
      rows.push({
        key: 'messages',
        level: 'today',
        title: `${unread.length} message${unread.length > 1 ? 's' : ''} non lu${unread.length > 1 ? 's' : ''}`,
        detail: unread.slice(0, 3).map((c) => c.title).join(', ') + (unread.length > 3 ? '…' : ''),
        meta: 'Messages',
        href: unread.length === 1 ? `/messages?c=${encodeURIComponent(unread[0].key)}` : '/messages',
      });

    // Relances: one row for the whole queue — it is handled in /relances.
    const due = (deals || []).filter((d) => !CLOSED.includes(d.stage) && d.next_relance_at && daysUntil(d.next_relance_at) <= 0);
    if (due.length) {
      const late = due.filter((d) => daysUntil(d.next_relance_at!) < 0).length;
      rows.push({
        key: 'relances',
        level: late ? 'late' : 'today',
        title: `${due.length} relance${due.length > 1 ? 's' : ''} à envoyer`,
        detail: due
          .slice(0, 3)
          .map((d) => dealLabel(d))
          .join(', ') + (due.length > 3 ? '…' : ''),
        meta: late ? `${late} en retard` : "aujourd'hui",
        href: '/relances',
      });
    }

    // Tasks: overdue, today and the next 3 days, each one checkable here.
    for (const t of tasks || []) {
      if (t.completed_at || !t.due_date) continue;
      const n = daysUntil(t.due_date);
      if (n > 3) continue;
      rows.push({ key: `task-${t.id}`, level: n < 0 ? 'late' : n === 0 ? 'today' : 'soon', title: t.title, meta: inDays(n), task: t });
    }

    // Festival / tremplin applications closing within 3 weeks.
    for (const v of venues || []) {
      if (v.style_fit === 'no') continue;
      const w = applicationWindow(v.application_opens, v.application_deadline);
      if (!w || w.status !== 'open' || w.days_left > 21) continue;
      rows.push({
        key: `app-${v.id}`,
        level: w.days_left <= 3 ? 'today' : 'soon',
        title: `Candidater : ${v.name}`,
        meta: w.days_left === 0 ? "clôture aujourd'hui" : `clôture ${inDays(w.days_left)}`,
        href: '/venues',
      });
    }

    // Concerts this week.
    for (const d of deals || []) {
      if (d.stage !== 'confirme' || !d.concert_date) continue;
      const n = daysUntil(d.concert_date);
      if (n < 0 || n > 7) continue;
      rows.push({
        key: `gig-${d.id}`,
        level: 'info',
        title: `Concert : ${dealLabel(d)}`,
        detail: d.venue?.city ?? undefined,
        meta: n === 0 ? 'ce soir' : inDays(n),
        href: `/pipeline?deal=${d.id}`,
      });
    }

    // New radar leads waiting to be sorted.
    if (!radar.isLoading && !radar.error) {
      const fresh = triQueue(radar.leads, radar.meta, new Set()).length;
      if (fresh) rows.push({ key: 'radar', level: 'info', title: `${fresh} nouvelle${fresh > 1 ? 's' : ''} piste${fresh > 1 ? 's' : ''} à trier`, meta: 'Radar', href: '/radar' });
    }

    return rows.sort((a, b) => RANK[a.level] - RANK[b.level]);
  }, [deals, tasks, venues, radar.isLoading, radar.error, radar.leads, radar.meta, emails, contacts]);
}

function TaskCheck({ task }: { task: Task }) {
  const update = useUpdateTask();
  const done = !!task.completed_at;
  return (
    <button
      type="button"
      aria-label={done ? 'Marquer non faite' : 'Marquer faite'}
      onClick={() => update.mutate({ id: task.id, completed_at: done ? null : new Date().toISOString() })}
      className={cn(
        'flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors',
        done ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/50 hover:border-primary',
      )}
    >
      {done && <Check className="h-3 w-3" strokeWidth={3} />}
    </button>
  );
}

function RowLine({ row }: { row: Row }) {
  const body = (
    <>
      {row.task ? <TaskCheck task={row.task} /> : <span className={cn('h-2 w-2 shrink-0 rounded-full', DOT[row.level])} />}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px]">{row.title}</span>
        {row.detail && <span className="block truncate text-[13px] text-muted-foreground">{row.detail}</span>}
      </span>
      <span className={cn('shrink-0 text-[13px]', row.level === 'late' ? 'text-[hsl(var(--status-urgent))]' : 'text-muted-foreground')}>{row.meta}</span>
      {row.href && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50" />}
    </>
  );
  const cls = 'flex items-center gap-3 py-3';
  return row.href ? (
    <Link href={row.href} className={cn(cls, '-mx-3 rounded-lg px-3 transition-colors hover:bg-secondary')}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function AddTask() {
  const create = useCreateTask();
  const [title, setTitle] = useState('');
  return (
    <form
      className="flex items-center gap-3 py-3"
      onSubmit={(e) => {
        e.preventDefault();
        const t = title.trim();
        if (!t) return;
        create.mutate(
          { title: t, due_date: new Date().toISOString().slice(0, 10), deal_id: null, venue_id: null },
          { onSuccess: () => setTitle(''), onError: () => toast.error("Impossible d'ajouter la tâche") },
        );
      }}
    >
      <Plus className="h-[18px] w-[18px] shrink-0 text-primary" />
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Ajouter une tâche pour aujourd’hui"
        className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground/70"
      />
    </form>
  );
}

export function TodayList() {
  const rows = useTodayRows();
  return (
    <section>
      <h2 className="font-display flex items-baseline gap-2 text-[20px] font-semibold">
        À faire
        {rows.length > 0 && <span className="text-[15px] font-normal text-muted-foreground">{rows.length}</span>}
      </h2>
      <div className="mt-2 divide-y border-y">
        {rows.length === 0 && <p className="py-6 text-[15px] text-muted-foreground">Rien d’urgent aujourd’hui.</p>}
        {rows.map((r) => (
          <RowLine key={r.key} row={r} />
        ))}
        <AddTask />
      </div>
    </section>
  );
}
