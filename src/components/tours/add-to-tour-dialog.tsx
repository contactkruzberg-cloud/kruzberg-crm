'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useTours } from '@/hooks/use-tours';
import { useAllTourStops, useCreateTourStop } from '@/hooks/use-tour-stops';
import { TOUR_STATUSES, type Deal } from '@/types/database';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Plus, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface AddToTourDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deal: Deal;
}

export function AddToTourDialog({ open, onOpenChange, deal }: AddToTourDialogProps) {
  const router = useRouter();
  const { data: tours } = useTours();
  const { data: allStops } = useAllTourStops();
  const createStop = useCreateTourStop();

  // tours that already include this deal
  const tourIdsWithDeal = useMemo(
    () => new Set((allStops || []).filter((s) => s.deal_id === deal.id).map((s) => s.tour_id)),
    [allStops, deal.id]
  );

  const countByTour = useMemo(() => {
    const map = new Map<string, number>();
    (allStops || []).forEach((s) => map.set(s.tour_id, (map.get(s.tour_id) || 0) + 1));
    return map;
  }, [allStops]);

  const addToTour = async (tourId: string) => {
    try {
      await createStop.mutateAsync({
        tour_id: tourId,
        deal_id: deal.id,
        venue_id: deal.venue_id,
        stop_date: deal.concert_date || new Date().toISOString().slice(0, 10),
        type: 'show',
        order_index: countByTour.get(tourId) || 0,
        fee: deal.fee,
        city: deal.venue?.city || null,
        latitude: deal.venue?.latitude ?? null,
        longitude: deal.venue?.longitude ?? null,
      });
      toast.success('Date ajoutée à la tournée');
      onOpenChange(false);
    } catch {
      toast.error("Erreur lors de l'ajout");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ajouter à une tournée</DialogTitle>
          <DialogDescription>
            {deal.venue?.name}
            {deal.concert_date && ` · ${new Date(deal.concert_date).toLocaleDateString('fr-FR')}`}
          </DialogDescription>
        </DialogHeader>

        {tours && tours.length > 0 ? (
          <ScrollArea className="max-h-72 pr-3">
            <div className="space-y-2">
              {tours.map((tour) => {
                const already = tourIdsWithDeal.has(tour.id);
                const status = TOUR_STATUSES.find((s) => s.key === tour.status);
                return (
                  <button
                    key={tour.id}
                    type="button"
                    disabled={already || createStop.isPending}
                    onClick={() => addToTour(tour.id)}
                    className={cn(
                      'w-full text-left rounded-lg border p-3 transition-colors flex items-center justify-between gap-2',
                      already
                        ? 'opacity-60 cursor-default'
                        : 'hover:border-primary/50 hover:bg-accent'
                    )}
                  >
                    <div>
                      <span className="font-medium text-sm">{tour.name}</span>
                      <div className="text-xs text-muted-foreground">
                        {countByTour.get(tour.id) || 0} date(s)
                      </div>
                    </div>
                    {already ? (
                      <Badge variant="secondary" className="gap-1 text-[10px]">
                        <Check className="h-3 w-3" />
                        Déjà dedans
                      </Badge>
                    ) : (
                      <Badge variant="outline" className={cn('text-[10px]', status?.color)}>
                        {status?.label}
                      </Badge>
                    )}
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        ) : (
          <p className="text-sm text-muted-foreground py-4 text-center">
            Aucune tournée pour l&apos;instant.
          </p>
        )}

        <button
          type="button"
          onClick={() => {
            onOpenChange(false);
            router.push('/tours');
          }}
          className="flex items-center gap-2 text-sm text-primary hover:underline mt-1"
        >
          <Plus className="h-4 w-4" />
          Créer une nouvelle tournée
        </button>
      </DialogContent>
    </Dialog>
  );
}
