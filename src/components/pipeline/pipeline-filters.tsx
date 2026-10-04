'use client';

import { SlidersHorizontal, X } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { usePersistentState } from '@/lib/persistent-state';
import { regionFromPostal } from '@/lib/france-geo';
import { cn } from '@/lib/utils';
import { VENUE_TYPES, type Deal } from '@/types/database';

export interface PipelineFilterState {
  due: boolean;
  high: boolean;
  noFollowUp: boolean;
  venueType: string;
  region: string;
  tag: string;
}

const DEFAULT: PipelineFilterState = { due: false, high: false, noFollowUp: false, venueType: 'all', region: 'all', tag: 'all' };
const CLOSED = ['confirme', 'termine', 'refuse'];

/** Pipeline quick filters, remembered across reloads. */
export function usePipelineFilters() {
  return usePersistentState<PipelineFilterState>('pipeline:filters', DEFAULT);
}

export function activeFilterCount(f: PipelineFilterState) {
  return [f.due, f.high, f.noFollowUp, f.venueType !== 'all', f.region !== 'all', f.tag !== 'all'].filter(Boolean).length;
}

export function applyPipelineFilters(deals: Deal[], f: PipelineFilterState): Deal[] {
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  return deals.filter((d) => {
    if (f.due && !(d.next_relance_at && !CLOSED.includes(d.stage) && new Date(d.next_relance_at) <= endOfToday)) return false;
    if (f.high && d.priority !== 'high') return false;
    if (f.noFollowUp && (d.next_relance_at || CLOSED.includes(d.stage))) return false;
    if (f.venueType !== 'all' && d.venue?.type !== f.venueType) return false;
    if (f.region !== 'all' && regionFromPostal(d.venue?.postal_code) !== f.region) return false;
    if (f.tag !== 'all' && !(d.tags ?? []).includes(f.tag)) return false;
    return true;
  });
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'px-2.5 py-1 rounded-full text-xs font-medium border transition-all whitespace-nowrap',
        active ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground border-border hover:border-primary/50',
      )}
    >
      {children}
    </button>
  );
}

export function PipelineFilters({ deals, filters, setFilters }: { deals: Deal[]; filters: PipelineFilterState; setFilters: (f: PipelineFilterState) => void }) {
  const set = (patch: Partial<PipelineFilterState>) => setFilters({ ...filters, ...patch });
  const regions = [...new Set(deals.map((d) => regionFromPostal(d.venue?.postal_code)).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, 'fr'));
  const tags = [...new Set(deals.flatMap((d) => d.tags ?? []))].sort((a, b) => a.localeCompare(b, 'fr'));
  const dueCount = applyPipelineFilters(deals, { ...DEFAULT, due: true }).length;
  const n = activeFilterCount(filters);

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
      <Chip active={filters.due} onClick={() => set({ due: !filters.due })}>
        Relances dues{dueCount ? ` (${dueCount})` : ''}
      </Chip>
      <Chip active={filters.high} onClick={() => set({ high: !filters.high })}>
        Priorité haute
      </Chip>
      <Chip active={filters.noFollowUp} onClick={() => set({ noFollowUp: !filters.noFollowUp })}>
        Sans relance prévue
      </Chip>
      <Select value={filters.venueType} onValueChange={(v) => set({ venueType: v })}>
        <SelectTrigger className={cn('h-7 w-auto gap-1 text-xs rounded-full', filters.venueType !== 'all' && 'border-primary text-primary')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Toutes catégories</SelectItem>
          {VENUE_TYPES.map((t) => (
            <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {regions.length > 0 && (
        <Select value={filters.region} onValueChange={(v) => set({ region: v })}>
          <SelectTrigger className={cn('h-7 w-auto gap-1 text-xs rounded-full', filters.region !== 'all' && 'border-primary text-primary')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes régions</SelectItem>
            {regions.map((r) => (
              <SelectItem key={r} value={r}>{r}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {tags.length > 0 && (
        <Select value={filters.tag} onValueChange={(v) => set({ tag: v })}>
          <SelectTrigger className={cn('h-7 w-auto gap-1 text-xs rounded-full', filters.tag !== 'all' && 'border-primary text-primary')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les tags</SelectItem>
            {tags.map((t) => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {n > 0 && (
        <button type="button" onClick={() => setFilters(DEFAULT)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <X className="h-3 w-3" /> Effacer ({n})
        </button>
      )}
    </div>
  );
}
