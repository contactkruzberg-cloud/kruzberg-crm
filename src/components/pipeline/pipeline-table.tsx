'use client';

import { useMemo, useRef } from 'react';
import { usePersistentState } from '@/lib/persistent-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn, formatDate, getRelanceUrgency, daysUntil, dealLabel } from '@/lib/utils';
import { STAGES, type Deal, type DealStage } from '@/types/database';
import { ArrowUpDown, Clock } from 'lucide-react';
import { DealQuickActions } from './deal-quick-actions';

interface PipelineTableProps {
  deals: Deal[];
  onDealClick: (id: string) => void;
  /** Why a deal matched the search, when not visible in the row. */
  hints?: Map<string, string>;
  selectedIds: Set<string>;
  /** Select / deselect these deals. */
  onSelect: (ids: string[], selected: boolean) => void;
}

type SortField = 'venue' | 'city' | 'stage' | 'priority' | 'next_relance' | 'last_message';

export function PipelineTable({ deals, onDealClick, hints, selectedIds, onSelect }: PipelineTableProps) {
  const [sortField, setSortField] = usePersistentState<SortField>('pipeline:table-sort', 'next_relance');
  const [sortDir, setSortDir] = usePersistentState<'asc' | 'desc'>('pipeline:table-dir', 'asc');
  const [stageFilter, setStageFilter] = usePersistentState<DealStage | 'all'>('pipeline:table-stage', 'all');

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const filtered = useMemo(() => {
    let result = [...deals];

    if (stageFilter !== 'all') {
      result = result.filter((d) => d.stage === stageFilter);
    }

    result.sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      switch (sortField) {
        case 'venue':
          return dir * dealLabel(a, '').localeCompare(dealLabel(b, ''));
        case 'city':
          return dir * (a.venue?.city || '').localeCompare(b.venue?.city || '');
        case 'stage':
          return dir * a.stage.localeCompare(b.stage);
        case 'priority':
          return dir * a.priority.localeCompare(b.priority);
        case 'next_relance':
          return dir * ((a.next_relance_at || '9999').localeCompare(b.next_relance_at || '9999'));
        case 'last_message':
          return dir * ((b.last_message_at || '').localeCompare(a.last_message_at || ''));
        default:
          return 0;
      }
    });

    return result;
  }, [deals, stageFilter, sortField, sortDir]);

  // Shift+click selects the whole range since the last checkbox clicked.
  const lastClicked = useRef<string | null>(null);
  const toggleRow = (id: string, shift: boolean) => {
    const selected = !selectedIds.has(id);
    const from = lastClicked.current ? filtered.findIndex((d) => d.id === lastClicked.current) : -1;
    const to = filtered.findIndex((d) => d.id === id);
    if (shift && from !== -1 && to !== -1) {
      const [a, b] = from < to ? [from, to] : [to, from];
      onSelect(filtered.slice(a, b + 1).map((d) => d.id), selected);
    } else {
      onSelect([id], selected);
    }
    lastClicked.current = id;
  };
  const selectedVisible = filtered.filter((d) => selectedIds.has(d.id)).length;
  const allSelected = filtered.length > 0 && selectedVisible === filtered.length;

  const SortHeader = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <button
      className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
      onClick={() => toggleSort(field)}
    >
      {children}
      <ArrowUpDown className="h-3 w-3" />
    </button>
  );

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="flex gap-1.5 flex-wrap">
          <Button
            size="sm"
            variant={stageFilter === 'all' ? 'default' : 'outline'}
            onClick={() => setStageFilter('all')}
          >
            Tous
          </Button>
          {STAGES.map((s) => (
            <Button
              key={s.key}
              size="sm"
              variant={stageFilter === s.key ? 'default' : 'outline'}
              onClick={() => setStageFilter(s.key)}
            >
              {s.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="w-10 p-3">
                  <input
                    type="checkbox"
                    className="h-4 w-4 cursor-pointer accent-[hsl(var(--primary))] align-middle"
                    aria-label="Tout sélectionner"
                    title="Tout sélectionner"
                    checked={allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = selectedVisible > 0 && !allSelected;
                    }}
                    onChange={() => onSelect(filtered.map((d) => d.id), !allSelected)}
                  />
                </th>
                <th className="text-left p-3"><SortHeader field="venue">Lieu</SortHeader></th>
                <th className="text-left p-3"><SortHeader field="city">Ville</SortHeader></th>
                <th className="text-left p-3"><SortHeader field="stage">Stage</SortHeader></th>
                <th className="text-left p-3"><SortHeader field="priority">Priorité</SortHeader></th>
                <th className="text-left p-3"><SortHeader field="next_relance">Relance</SortHeader></th>
                <th className="text-left p-3"><SortHeader field="last_message">Dernier contact</SortHeader></th>
                <th className="text-left p-3">Tags</th>
                <th className="text-left p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((deal) => {
                const urgency = getRelanceUrgency(deal.next_relance_at);
                const stageData = STAGES.find((s) => s.key === deal.stage);
                const isSelected = selectedIds.has(deal.id);
                return (
                  <tr
                    key={deal.id}
                    onClick={() => onDealClick(deal.id)}
                    className={cn(
                      'border-b hover:bg-muted/30 cursor-pointer transition-colors',
                      isSelected && 'bg-primary/5 hover:bg-primary/10'
                    )}
                  >
                    <td
                      className="w-10 p-3"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleRow(deal.id, e.shiftKey);
                      }}
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 cursor-pointer accent-[hsl(var(--primary))] align-middle pointer-events-none"
                        aria-label="Sélectionner"
                        checked={isSelected}
                        readOnly
                      />
                    </td>
                    <td className="p-3 font-medium">
                      {dealLabel(deal, '—')}
                      {deal.title?.trim() && (deal.venue || deal.contact) && (
                        <span className="block text-xs font-normal text-muted-foreground">
                          {deal.venue?.name || deal.contact?.name}
                        </span>
                      )}
                      {hints?.get(deal.id) && (
                        <span className="block text-xs font-normal text-primary/80 truncate max-w-xs">
                          ↳ {hints.get(deal.id)}
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-muted-foreground">{deal.venue?.city || '—'}</td>
                    <td className="p-3">
                      <span className={cn('inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium', stageData?.color)}>
                        {stageData?.label}
                      </span>
                    </td>
                    <td className="p-3">
                      <Badge
                        variant={
                          deal.priority === 'high' ? 'destructive' : deal.priority === 'medium' ? 'warning' : 'secondary'
                        }
                      >
                        {deal.priority === 'high' ? 'Haute' : deal.priority === 'medium' ? 'Moyenne' : 'Basse'}
                      </Badge>
                    </td>
                    <td className="p-3">
                      {deal.next_relance_at ? (
                        <div className={cn(
                          'flex items-center gap-1 text-xs',
                          urgency === 'overdue' && 'text-red-500 font-medium',
                          urgency === 'urgent' && 'text-orange-500'
                        )}>
                          <Clock className="h-3 w-3" />
                          {urgency === 'overdue'
                            ? `${Math.abs(daysUntil(deal.next_relance_at))}j retard`
                            : formatDate(deal.next_relance_at)}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </td>
                    <td className="p-3 text-muted-foreground text-xs">
                      {deal.last_message_at ? formatDate(deal.last_message_at) : '—'}
                    </td>
                    <td className="p-3">
                      <div className="flex gap-1 flex-wrap">
                        {deal.tags?.slice(0, 2).map((tag) => (
                          <Badge key={tag} variant="secondary" className="text-[10px]">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td className="p-3">
                      <DealQuickActions deal={deal} />
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-muted-foreground">
                    Aucune opportunité trouvée
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
