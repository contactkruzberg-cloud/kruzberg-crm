'use client';

import { useState, useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn, formatDate, getRelanceUrgency, daysUntil } from '@/lib/utils';
import { STAGES, type Deal, type DealStage } from '@/types/database';
import { ArrowUpDown, Search, Clock } from 'lucide-react';

interface PipelineTableProps {
  deals: Deal[];
  onDealClick: (id: string) => void;
}

type SortField = 'venue' | 'city' | 'stage' | 'priority' | 'next_relance' | 'last_message';

export function PipelineTable({ deals, onDealClick }: PipelineTableProps) {
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('next_relance');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [stageFilter, setStageFilter] = useState<DealStage | 'all'>('all');

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

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (d) =>
          d.venue?.name?.toLowerCase().includes(q) ||
          d.venue?.city?.toLowerCase().includes(q) ||
          d.tags?.some((t) => t.toLowerCase().includes(q))
      );
    }

    result.sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      switch (sortField) {
        case 'venue':
          return dir * (a.venue?.name || '').localeCompare(b.venue?.name || '');
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
  }, [deals, search, stageFilter, sortField, sortDir]);

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
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
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
                <th className="text-left p-3"><SortHeader field="venue">Lieu</SortHeader></th>
                <th className="text-left p-3"><SortHeader field="city">Ville</SortHeader></th>
                <th className="text-left p-3"><SortHeader field="stage">Stage</SortHeader></th>
                <th className="text-left p-3"><SortHeader field="priority">Priorité</SortHeader></th>
                <th className="text-left p-3"><SortHeader field="next_relance">Relance</SortHeader></th>
                <th className="text-left p-3"><SortHeader field="last_message">Dernier msg</SortHeader></th>
                <th className="text-left p-3">Tags</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((deal) => {
                const urgency = getRelanceUrgency(deal.next_relance_at);
                const stageData = STAGES.find((s) => s.key === deal.stage);
                return (
                  <tr
                    key={deal.id}
                    onClick={() => onDealClick(deal.id)}
                    className="border-b hover:bg-muted/30 cursor-pointer transition-colors"
                  >
                    <td className="p-3 font-medium">{deal.venue?.name || '—'}</td>
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
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-muted-foreground">
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
