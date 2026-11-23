'use client';

import { ScrollArea } from '@/components/ui/scroll-area';
import { EmptyState } from '@/components/ui/empty-state';
import { cn } from '@/lib/utils';
import type { Venue, VenueType } from '@/types/database';
import { Building2 } from 'lucide-react';
import { applicationWindow } from '@/lib/application-dates';

const TYPE_LABELS: Record<VenueType, string> = {
  bar: 'Bar',
  salle: 'Salle',
  festival: 'Festival',
  cafe_concert: 'Café',
  mjc: 'MJC',
  organisateur: 'Orga',
  media: 'Média',
  other: 'Autre',
};

interface VenueListProps {
  venues: Venue[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function VenueList({ venues, selectedId, onSelect }: VenueListProps) {
  if (venues.length === 0) {
    return (
      <EmptyState icon={Building2} title="Aucun lieu" hint="Ajoute un lieu avec « Nouveau », ou importe un fichier." />
    );
  }

  return (
    <ScrollArea className="h-[calc(100vh-280px)]">
      <div className="divide-y pr-2">
        {venues.map((venue) => {
          const appWindow = applicationWindow(venue.application_opens, venue.application_deadline);
          const blocked = !!venue.do_not_contact_until && venue.do_not_contact_until > new Date().toISOString().slice(0, 10);
          const on = selectedId === venue.id;
          return (
            <button
              type="button"
              key={venue.id}
              onClick={() => onSelect(venue.id)}
              className={cn(
                'block w-full rounded-lg px-3 py-2.5 text-left transition-colors',
                on ? 'bg-primary text-primary-foreground' : 'hover:bg-secondary',
              )}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate text-[15px] font-medium">{venue.name}</span>
                {appWindow && appWindow.days_left <= 45 ? (
                  <span className={cn('shrink-0 text-[12px]', on ? 'text-primary-foreground/80' : 'text-[hsl(var(--status-warning))]')}>
                    candidature J-{appWindow.days_left}
                  </span>
                ) : (
                  venue.fit_score > 0 && <span className={cn('shrink-0 text-[12px]', on ? 'text-primary-foreground/80' : 'text-muted-foreground')}>{'★'.repeat(venue.fit_score)}</span>
                )}
              </div>
              <div className={cn('mt-0.5 truncate text-[13px]', on ? 'text-primary-foreground/80' : 'text-muted-foreground')}>
                {[venue.city, TYPE_LABELS[venue.type], venue.capacity ? `${venue.capacity} pers.` : null, venue.style_fit === 'yes' ? 'notre style' : null, blocked ? 'ne pas recontacter' : null]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
            </button>
          );
        })}
      </div>
    </ScrollArea>
  );
}
