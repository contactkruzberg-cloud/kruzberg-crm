'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn, getRelanceUrgency, daysUntil, dealLabel } from '@/lib/utils';
import { STAGE_HEX, VENUE_TYPES, type Deal } from '@/types/database';
import { CalendarDays, Check, Clock, Star } from 'lucide-react';
import { contactKind, kindInfo } from '@/lib/contacts/roles';
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
  const stageColor = STAGE_HEX[deal.stage];
  const venueType = VENUE_TYPES.find((t) => t.key === deal.venue?.type)?.label;
  const place = [deal.title?.trim() ? deal.venue?.name || deal.contact?.name : null, venueType, deal.venue?.city].filter(Boolean).join(' · ');
  const contactFn = deal.contact ? contactKind({ ...deal.contact, venue: deal.venue }) : null;
  const lastTouch = deal.last_message_at ?? deal.first_contact_at;
  const sinceTouch = lastTouch ? -daysUntil(lastTouch) : null;
  const concertIn = deal.concert_date ? daysUntil(deal.concert_date) : null;
  const confirmed = deal.stage === 'confirme' || deal.stage === 'termine';
  const dead = deal.stage === 'refuse';

  return (
    <div
      ref={setNodeRef}
      style={{ ...style, ['--stage' as string]: stageColor }}
      {...attributes}
      {...listeners}
      onClick={selectionMode && onToggleSelect ? onToggleSelect : onClick}
      className={cn(
        'group relative cursor-pointer overflow-hidden rounded-xl bg-card py-2.5 pl-3.5 pr-3 shadow-card transition-shadow duration-150 hover:shadow-pop',
        'before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-[var(--stage)]',
        (isDragging || isSortDragging) && 'rotate-2 opacity-60 shadow-pop',
        dead && 'opacity-60',
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
        <h4 className="flex-1 truncate text-[14px] font-semibold leading-snug">
          {dealLabel(deal, 'Sans lieu')}
        </h4>
        {deal.priority === 'high' && (
          <Star className="h-3.5 w-3.5 text-yellow-500 shrink-0 fill-yellow-500" aria-label="Prioritaire" />
        )}
      </div>

      {place && <p className="mt-0.5 truncate text-[12.5px] text-muted-foreground">{place}</p>}

      {/* Date and fee: what the deal is about. */}
      {(deal.concert_date || deal.fee) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {deal.concert_date && (
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] font-medium',
                confirmed ? 'bg-[hsl(var(--stage-confirme)/0.14)] text-[hsl(var(--stage-confirme))]' : 'bg-secondary text-foreground/80'
              )}
              title={confirmed ? 'Date confirmée' : 'Date évoquée, pas encore confirmée'}
            >
              <CalendarDays className="h-3 w-3" />
              {new Date(deal.concert_date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', ...(new Date(deal.concert_date).getFullYear() !== new Date().getFullYear() ? { year: '2-digit' } : {}) })}
              {!confirmed && ' ?'}
              {confirmed && concertIn !== null && concertIn >= 0 && concertIn <= 30 && <span className="font-normal opacity-80">· J-{concertIn}</span>}
            </span>
          )}
          {deal.fee ? (
            <span className="inline-flex items-center rounded-md bg-secondary px-1.5 py-0.5 text-[12px] font-medium tabular-nums text-foreground/80">
              {deal.fee.toLocaleString('fr-FR')} €
            </span>
          ) : null}
        </div>
      )}

      {/* Their answer, for deals waiting on us. */}
      {deal.response?.trim() && ['repondu', 'a_suivre', 'refuse'].includes(deal.stage) && (
        <p className="mt-1.5 line-clamp-2 border-l-2 pl-2 text-[12px] italic leading-snug text-muted-foreground">{deal.response.trim()}</p>
      )}

      {hint && (
        <p className="mt-1 text-[11px] text-primary/80 truncate" title={hint}>
          ↳ {hint}
        </p>
      )}

      {/* Who, and how long since the last exchange. */}
      <div className="mt-1.5 flex items-center justify-between gap-2 text-[12px] text-muted-foreground">
        <span className="flex min-w-0 items-center gap-1.5">
          {deal.contact && (
            <>
              <span
                className={cn('h-1.5 w-1.5 shrink-0 rounded-full', !contactFn?.sure && 'opacity-50')}
                style={{ background: contactFn?.kind ? kindInfo(contactFn.kind).color : 'hsl(var(--muted-foreground))' }}
                title={contactFn?.kind ? kindInfo(contactFn.kind).label : undefined}
              />
              <span className="truncate">
                {deal.contact.name}
                {contactFn?.kind && <span className="opacity-70"> · {kindInfo(contactFn.kind).label.replace('·rice', '').replace(' / agent', '')}</span>}
              </span>
            </>
          )}
        </span>
        {sinceTouch !== null && sinceTouch >= 0 && !['a_contacter', 'termine'].includes(deal.stage) && (
          <span className={cn('shrink-0 tabular-nums', sinceTouch > 30 && !confirmed && !dead && 'text-[hsl(var(--status-warning))]')} title="Dernier échange">
            {sinceTouch === 0 ? 'auj.' : `il y a ${sinceTouch} j`}
          </span>
        )}
      </div>

      {deal.next_relance_at && urgency && urgency !== 'ok' && (
        <div
          className={cn(
            'mt-1.5 flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] font-medium',
            urgency === 'overdue' ? 'bg-[hsl(var(--status-urgent)/0.12)] text-[hsl(var(--status-urgent))]' : 'bg-[hsl(var(--status-warning)/0.12)] text-[hsl(var(--status-warning))]'
          )}
        >
          <Clock className="h-3 w-3" />
          {urgency === 'overdue'
            ? `Relance en retard de ${Math.abs(daysUntil(deal.next_relance_at))} j`
            : daysUntil(deal.next_relance_at) === 0 ? "Relance aujourd'hui" : `Relance dans ${daysUntil(deal.next_relance_at)} j`}
        </div>
      )}

      {deal.tags?.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {deal.tags.slice(0, 3).map((t) => (
            <span key={t} className="rounded-full border px-1.5 text-[11px] text-muted-foreground">
              {t}
            </span>
          ))}
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
