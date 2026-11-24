'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useSupabase } from './use-supabase';
import { SAVE_META } from '@/lib/save-status';
import type { PlanGoal, PlanProject, PlanReading, PlanStep } from '@/lib/plan/model';

export interface PlanData {
  goals: PlanGoal[];
  readings: PlanReading[];
  projects: PlanProject[];
  steps: PlanStep[];
}

/** Migration 021 not run yet. */
export const isPlanSetupError = (e: unknown) => {
  const m = String((e as { message?: string })?.message ?? e);
  return /plan_/.test(m) && /does not exist|could not find|schema cache/i.test(m);
};

const KEY = ['plan'];
type Table = 'plan_goals' | 'plan_readings' | 'plan_projects' | 'plan_steps';
type Row = Record<string, unknown>;

export function usePlan() {
  const supabase = useSupabase();
  return useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<PlanData> => {
      const [g, r, p, s] = await Promise.all([
        supabase.from('plan_goals').select('*').is('archived_at', null).order('created_at'),
        supabase.from('plan_readings').select('*').order('measured_at'),
        supabase.from('plan_projects').select('*').is('archived_at', null).order('target_date'),
        supabase.from('plan_steps').select('*').order('offset_days'),
      ]);
      const err = g.error ?? r.error ?? p.error ?? s.error;
      if (err) throw new Error(err.message);
      const num = <T extends Row>(rows: T[], keys: string[]) => rows.map((x) => ({ ...x, ...Object.fromEntries(keys.map((k) => [k, Number(x[k])])) }));
      return {
        goals: num(g.data ?? [], ['baseline', 'target']) as PlanGoal[],
        readings: num(r.data ?? [], ['value']) as PlanReading[],
        projects: (p.data ?? []) as PlanProject[],
        steps: (s.data ?? []) as PlanStep[],
      };
    },
    retry: (n, e) => !isPlanSetupError(e) && n < 2,
  });
}

type Op =
  | { op: 'insert'; table: Table; rows: Row[] }
  | { op: 'update'; table: Table; id: string; patch: Row }
  | { op: 'delete'; table: Table; id: string };

/** One mutation for every plan write; the list refreshes after each. */
export function usePlanWrite() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  return useMutation({
    meta: SAVE_META,
    mutationFn: async (o: Op) => {
      if (o.op === 'insert') {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not authenticated');
        const { data, error } = await supabase.from(o.table).insert(o.rows.map((r) => ({ ...r, user_id: user.id }))).select('id');
        if (error) throw new Error(error.message);
        return (data ?? []) as { id: string }[];
      }
      const q = o.op === 'update' ? supabase.from(o.table).update(o.patch).eq('id', o.id) : supabase.from(o.table).delete().eq('id', o.id);
      const { error } = await q;
      if (error) throw new Error(error.message);
      return [];
    },
    onMutate: async (o) => {
      // Optimistic: checkboxes and dates move at once.
      if (o.op === 'insert') return;
      await qc.cancelQueries({ queryKey: KEY });
      const prev = qc.getQueryData<PlanData>(KEY);
      if (prev) {
        const key = ({ plan_goals: 'goals', plan_readings: 'readings', plan_projects: 'projects', plan_steps: 'steps' } as const)[o.table];
        const list = prev[key] as unknown as Row[];
        const next = o.op === 'update' ? list.map((x) => (x.id === o.id ? { ...x, ...o.patch } : x)) : list.filter((x) => x.id !== o.id);
        qc.setQueryData(KEY, { ...prev, [key]: next });
      }
      return { prev };
    },
    onError: (e, _o, ctx) => {
      if (ctx && 'prev' in ctx && ctx.prev) qc.setQueryData(KEY, ctx.prev);
      toast.error(isPlanSetupError(e) ? 'Lance la migration 021 dans Supabase pour activer le plan de route.' : 'Échec de l’enregistrement');
    },
    onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
