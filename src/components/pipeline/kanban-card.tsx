'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn, getRelanceUrgency, daysUntil, dealLabel } from '@/lib/utils';
import type { Deal } from '@/types/database';
import { Check, Star } from 'lucide-react';
import { DealQuickActions } from './deal-quick-actions';

interface KanbanCardProps {
  deal: Deal;
  onClick: () => void;
  isDragging?: boolean;
  /** Why this deal matched the search ("Contact : Jean Dupont"). */
  hint?: string;
  selected?: boolean;
  /** Some cards are selected: a click toggles the selection instead of opening the deal. */
  selectionMode?: boolean;
  onToggleSelect?: () => void;
}

export function KanbanCard({ deal, onClick, isDragging, hint, selected, selectionMode, onToggleSelect }: KanbanCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortDragging,
  } = useSortable({ id: deal.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const showRelanceAlert = ['contacte', 'relance'].includes(deal.stage);
  const urgency = showRelanceAlert ? getRelanceUrgency(deal.next_relance_at) : null;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={selectionMode && onToggleSelect ? onToggleSelect : onClick}
      className={cn(
        'group relative cursor-pointer rounded-xl bg-card p-3 shadow-card transition-shadow duration-150 hover:shadow-pop',
        (isDragging || isSortDragging) && 'rotate-2 opacity-60 shadow-pop',
        urgency === 'overdue' && 'shadow-[inset_3px_0_0_0_hsl(var(--status-urgent)),var(--elev-card)]',
        urgency === 'urgent' && 'shadow-[inset_3px_0_0_0_hsl(var(--status-warning)),var(--elev-card)]',
        selected && 'border-primary bg-primary/5 ring-1 ring-primary'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        {onToggleSelect && (
          <span
            role="checkbox"
            aria-checked={!!selected}
            aria-label="Sélectionner"
            title="Sélectionner"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelect();
            }}
            className={cn(
              'mt-0.5 -ml-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-all',
              selected
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-muted-foreground/40 bg-background',
              !selectionMode && '-mr-6 opacity-0 group-hover:mr-0 group-hover:opacity-100'
            )}
          >
            {selected && <Check className="h-3 w-3" strokeWidth={3} />}
          </span>
        )}
        <h4 className="flex-1 truncate text-[13.5px] font-semibold leading-snug">
          {dealLabel(deal, 'Sans lieu')}
        </h4>
        {deal.priority === 'high' && (
          <Star className="h-3.5 w-3.5 text-yellow-500 shrink-0 fill-yellow-500" />
        )}
      </div>

      {(deal.title?.trim() || deal.venue?.city) && (
        <div className="mt-0.5 flex items-center gap-1 text-[12.5px] text-muted-foreground">
          <span className="truncate">
            {[deal.title?.trim() ? deal.venue?.name || deal.contact?.name : null, deal.venue?.city]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </div>
      )}

      {hint && (
        <p className="mt-1 text-[11px] text-primary/80 truncate" title={hint}>
          ↳ {hint}
        </p>
      )}

      {deal.next_relance_at && urgency && urgency !== 'ok' && (
        <div
          className={cn(
            'mt-1.5 flex items-center gap-1 text-[12px] font-medium',
            urgency === 'overdue' ? 'text-[hsl(var(--status-urgent))]' : 'text-[hsl(var(--status-warning))]'
          )}
        >
          {urgency === 'overdue'
            ? `Relance en retard de ${Math.abs(daysUntil(deal.next_relance_at))} j`
            : daysUntil(deal.next_relance_at) === 0 ? "Relance aujourd'hui" : `Relance dans ${daysUntil(deal.next_relance_at)} j`}
        </div>
      )}

      {/* Actions: always there on touch screens, on hover with a mouse. */}
      <DealQuickActions
        deal={deal}
        className="mt-2 border-t pt-2 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100"
      />
    </div>
  );
}
