'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Badge } from '@/components/ui/badge';
import { cn, getRelanceUrgency, daysUntil, formatRelativeDate } from '@/lib/utils';
import type { Deal } from '@/types/database';
import { Clock, MapPin, Star } from 'lucide-react';

interface KanbanCardProps {
  deal: Deal;
  onClick: () => void;
  isDragging?: boolean;
}

export function KanbanCard({ deal, onClick, isDragging }: KanbanCardProps) {
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

  const urgency = getRelanceUrgency(deal.next_relance_at);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={cn(
        'rounded-lg border bg-card p-3 cursor-pointer transition-all duration-200 hover:shadow-md hover:border-primary/30',
        (isDragging || isSortDragging) && 'opacity-50 rotate-2 shadow-xl',
        urgency === 'overdue' && 'border-red-500/40',
        urgency === 'urgent' && 'border-orange-500/30'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-sm font-medium truncate">
          {deal.venue?.name || 'Sans lieu'}
        </h4>
        {deal.priority === 'high' && (
          <Star className="h-3.5 w-3.5 text-yellow-500 shrink-0 fill-yellow-500" />
        )}
      </div>

      {deal.venue?.city && (
        <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
          <MapPin className="h-3 w-3" />
          {deal.venue.city}
        </div>
      )}

      <div className="flex items-center gap-2 mt-2 flex-wrap">
        {deal.tags?.slice(0, 2).map((tag) => (
          <Badge key={tag} variant="secondary" className="text-[10px] px-1.5 py-0">
            {tag}
          </Badge>
        ))}
      </div>

      {deal.next_relance_at && urgency && urgency !== 'ok' && (
        <div
          className={cn(
            'flex items-center gap-1 mt-2 text-xs font-medium',
            urgency === 'overdue' ? 'text-red-500' : 'text-orange-500'
          )}
        >
          <Clock className="h-3 w-3" />
          {urgency === 'overdue'
            ? `${Math.abs(daysUntil(deal.next_relance_at))}j de retard`
            : `Relance dans ${daysUntil(deal.next_relance_at)}j`}
        </div>
      )}

      {deal.last_message_at && (
        <p className="text-[10px] text-muted-foreground mt-1.5">
          Dernier msg: {formatRelativeDate(deal.last_message_at)}
        </p>
      )}
    </div>
  );
}
