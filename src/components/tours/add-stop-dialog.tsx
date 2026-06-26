'use client';

import { useState, useMemo } from 'react';
import { useDeals } from '@/hooks/use-deals';
import { useCreateTourStop } from '@/hooks/use-tour-stops';
import { geocodeAddress } from '@/lib/geocode';
import type { TourStop, TourStopType, Deal } from '@/types/database';
import { STOP_TYPES } from '@/types/database';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MapPin, Calendar, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface AddStopDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tourId: string;
  stops: TourStop[];
}

export function AddStopDialog({ open, onOpenChange, tourId, stops }: AddStopDialogProps) {
  const { data: deals } = useDeals();
  const createStop = useCreateTourStop();
  const [tab, setTab] = useState('deal');

  // Free stop fields
  const [freeType, setFreeType] = useState<TourStopType>('show');
  const [freeCity, setFreeCity] = useState('');
  const [freeCountry, setFreeCountry] = useState('France');
  const [freeDate, setFreeDate] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const usedDealIds = useMemo(
    () => new Set(stops.map((s) => s.deal_id).filter(Boolean)),
    [stops]
  );

  // Confirmed / done deals not already in this tour
  const availableDeals = useMemo(() => {
    return (deals || [])
      .filter((d) => (d.stage === 'confirme' || d.stage === 'termine') && !usedDealIds.has(d.id))
      .sort((a, b) => {
        const da = a.concert_date || '';
        const db = b.concert_date || '';
        return da.localeCompare(db);
      });
  }, [deals, usedDealIds]);

  const nextOrder = stops.length;

  const addFromDeal = async (deal: Deal) => {
    setSubmitting(true);
    try {
      await createStop.mutateAsync({
        tour_id: tourId,
        deal_id: deal.id,
        venue_id: deal.venue_id,
        stop_date: deal.concert_date || new Date().toISOString().slice(0, 10),
        type: 'show',
        order_index: nextOrder,
        fee: deal.fee,
        city: deal.venue?.city || null,
        latitude: deal.venue?.latitude ?? null,
        longitude: deal.venue?.longitude ?? null,
      });
      toast.success(`${deal.venue?.name || 'Date'} ajoutée à la tournée`);
      onOpenChange(false);
    } catch {
      toast.error("Erreur lors de l'ajout");
    } finally {
      setSubmitting(false);
    }
  };

  const addFreeStop = async () => {
    if (!freeDate) {
      toast.error('La date est requise');
      return;
    }
    setSubmitting(true);
    try {
      let latitude: number | null = null;
      let longitude: number | null = null;
      if (freeCity.trim()) {
        try {
          const geo = await geocodeAddress({ city: freeCity.trim(), country: freeCountry.trim() || null });
          if (geo) {
            latitude = geo.lat;
            longitude = geo.lng;
          }
        } catch {
          // geocoding best-effort; stop is still created without coords
        }
      }
      await createStop.mutateAsync({
        tour_id: tourId,
        stop_date: freeDate,
        type: freeType,
        order_index: nextOrder,
        city: freeCity.trim() || null,
        latitude,
        longitude,
      });
      toast.success('Étape ajoutée');
      setFreeCity('');
      setFreeCountry('France');
      setFreeDate('');
      setFreeType('show');
      onOpenChange(false);
    } catch {
      toast.error("Erreur lors de l'ajout");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ajouter une date</DialogTitle>
          <DialogDescription>
            Choisis un concert confirmé du pipeline, ou crée un arrêt libre (jour off, trajet).
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full">
            <TabsTrigger value="deal" className="flex-1">Depuis un deal</TabsTrigger>
            <TabsTrigger value="free" className="flex-1">Arrêt libre</TabsTrigger>
          </TabsList>

          <TabsContent value="deal" className="mt-4">
            {availableDeals.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-8">
                Aucun deal confirmé disponible. Confirme une date dans le pipeline, ou ajoute un arrêt libre.
              </div>
            ) : (
              <ScrollArea className="h-72 pr-3">
                <div className="space-y-2">
                  {availableDeals.map((deal) => (
                    <button
                      key={deal.id}
                      type="button"
                      disabled={submitting}
                      onClick={() => addFromDeal(deal)}
                      className="w-full text-left rounded-lg border p-3 hover:border-primary/50 hover:bg-accent transition-colors disabled:opacity-50"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-sm">{deal.venue?.name || 'Lieu'}</span>
                        {deal.fee != null && (
                          <span className="text-xs text-muted-foreground">{deal.fee} €</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                        {deal.venue?.city && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {deal.venue.city}
                          </span>
                        )}
                        {deal.concert_date && (
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {new Date(deal.concert_date).toLocaleDateString('fr-FR')}
                          </span>
                        )}
                        {deal.venue?.latitude == null && (
                          <span className="text-orange-500">Sans GPS</span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            )}
          </TabsContent>

          <TabsContent value="free" className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label>Type</Label>
              <div className="flex gap-2">
                {STOP_TYPES.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setFreeType(t.key)}
                    className={cn(
                      'px-3 py-1.5 rounded-full text-xs font-medium border transition-all',
                      freeType === t.key
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'border-border text-muted-foreground hover:border-primary/50'
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Date *</Label>
              <Input type="date" value={freeDate} onChange={(e) => setFreeDate(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Ville {freeType !== 'day_off' && '(géolocalisée)'}</Label>
                <Input
                  value={freeCity}
                  onChange={(e) => setFreeCity(e.target.value)}
                  placeholder="Vienne"
                />
              </div>
              <div className="space-y-2">
                <Label>Pays</Label>
                <Input
                  value={freeCountry}
                  onChange={(e) => setFreeCountry(e.target.value)}
                  placeholder="Autriche"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Annuler
              </Button>
              <Button onClick={addFreeStop} disabled={submitting} className="gap-2">
                <Check className="h-4 w-4" />
                {submitting ? 'Ajout...' : 'Ajouter'}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
