'use client';

import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { cn, formatRelativeDate } from '@/lib/utils';
import type { Venue, VenueType } from '@/types/database';
import { MapPin, Star, Building2 } from 'lucide-react';

const TYPE_LABELS: Record<VenueType, string> = {
  bar: 'Bar',
  salle: 'Salle',
  festival: 'Festival',
  cafe_concert: 'Café',
  mjc: 'MJC',
  organisateur: 'Orga',
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
      <div className="text-center py-12 text-muted-foreground border rounded-xl border-dashed">
        <Building2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">Aucun lieu trouvé</p>
        <p className="text-xs mt-1">Ajoutez votre premier lieu pour commencer</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-[calc(100vh-280px)]">
      <div className="space-y-2 pr-2">
        {venues.map((venue) => (
          <div
            key={venue.id}
            onClick={() => onSelect(venue.id)}
            className={cn(
              'rounded-lg border p-3 cursor-pointer transition-all duration-200 hover:shadow-md',
              selectedId === venue.id
                ? 'border-primary/50 bg-primary/5 shadow-sm'
                : 'hover:border-border/80'
            )}
          >
            <div className="flex items-start justify-between">
              <div className="min-w-0">
                <h3 className="font-medium text-sm truncate">{venue.name}</h3>
                <div className="flex items-center gap-1 mt-0.5 text-xs text-muted-foreground">
                  <MapPin className="h-3 w-3" />
                  {venue.city}
                </div>
              </div>
              <Badge variant="secondary" className="text-[10px] shrink-0">
                {TYPE_LABELS[venue.type]}
              </Badge>
            </div>
            <div className="flex items-center justify-between mt-2">
              <div className="flex items-center gap-0.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    className={cn(
                      'h-3 w-3',
                      i < venue.fit_score
                        ? 'text-yellow-500 fill-yellow-500'
                        : 'text-muted-foreground/30'
                    )}
                  />
                ))}
              </div>
              {venue.capacity && (
                <span className="text-[10px] text-muted-foreground">
                  {venue.capacity} pers.
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
