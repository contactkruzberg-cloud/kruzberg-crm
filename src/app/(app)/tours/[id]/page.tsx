'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTour, useUpdateTour, useDeleteTour } from '@/hooks/use-tours';
import { useTourStops } from '@/hooks/use-tour-stops';
import { TourItinerary } from '@/components/tours/tour-itinerary';
import { TourLogistics } from '@/components/tours/tour-logistics';
import { TourBudget } from '@/components/tours/tour-budget';
import { generateRoadbook } from '@/lib/tour-roadbook';
import { TOUR_STATUSES, type TourStatus } from '@/types/database';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { ArrowLeft, FileText, Trash2, Map, Hotel, Wallet } from 'lucide-react';
import { toast } from 'sonner';

export default function TourDetailPage() {
  const params = useParams<{ id: string }>();
  const tourId = params.id;
  const router = useRouter();

  const { data: tour, isLoading } = useTour(tourId);
  const { data: stops } = useTourStops(tourId);
  const updateTour = useUpdateTour();
  const deleteTour = useDeleteTour();

  const [nameDraft, setNameDraft] = useState<string | null>(null);

  if (isLoading || !tour) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const orderedStops = stops || [];

  const saveName = () => {
    const value = (nameDraft ?? '').trim();
    if (value && value !== tour.name) {
      updateTour.mutate({ id: tour.id, name: value });
    }
    setNameDraft(null);
  };

  const handleDelete = async () => {
    if (!confirm(`Supprimer la tournée "${tour.name}" ? Les dates seront retirées de la tournée (les deals restent dans le pipeline).`))
      return;
    await deleteTour.mutateAsync(tour.id);
    toast.success('Tournée supprimée');
    router.push('/tours');
  };

  const handleRoadbook = () => {
    if (orderedStops.length === 0) {
      toast.error('Ajoute au moins une date avant de générer la feuille de route');
      return;
    }
    generateRoadbook(tour, orderedStops);
  };

  const dates = orderedStops.map((s) => s.stop_date).filter(Boolean).sort();
  const start = tour.start_date || dates[0];
  const end = tour.end_date || dates[dates.length - 1];
  const rangeStr =
    start
      ? `${new Date(start).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}${
          end && end !== start
            ? ' → ' + new Date(end).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
            : ''
        }`
      : 'Dates à définir';

  return (
    <div className="space-y-4">
      {/* header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="space-y-1 min-w-0">
          <Link
            href="/tours"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground w-fit"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Toutes les tournées
          </Link>
          {nameDraft === null ? (
            <h1
              className="text-xl font-bold cursor-text hover:bg-accent/50 rounded px-1 -mx-1"
              onClick={() => setNameDraft(tour.name)}
              title="Cliquer pour renommer"
            >
              {tour.name}
            </h1>
          ) : (
            <Input
              autoFocus
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={saveName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveName();
                if (e.key === 'Escape') setNameDraft(null);
              }}
              className="text-xl font-bold h-9 max-w-md"
            />
          )}
          <p className="text-sm text-muted-foreground">
            {rangeStr} · {orderedStops.filter((s) => s.type === 'show').length} date(s)
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Select
            value={tour.status}
            onValueChange={(v) => updateTour.mutate({ id: tour.id, status: v as TourStatus })}
          >
            <SelectTrigger className="w-36 h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TOUR_STATUSES.map((s) => (
                <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="gap-2" onClick={handleRoadbook}>
            <FileText className="h-4 w-4" />
            Feuille de route PDF
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-muted-foreground hover:text-destructive"
            onClick={handleDelete}
            title="Supprimer la tournée"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* tabs */}
      <Tabs defaultValue="itinerary">
        <TabsList>
          <TabsTrigger value="itinerary" className="gap-1.5">
            <Map className="h-4 w-4" />
            Itinéraire
          </TabsTrigger>
          <TabsTrigger value="logistics" className="gap-1.5">
            <Hotel className="h-4 w-4" />
            Logistique
          </TabsTrigger>
          <TabsTrigger value="budget" className="gap-1.5">
            <Wallet className="h-4 w-4" />
            Budget
          </TabsTrigger>
        </TabsList>

        <TabsContent value="itinerary" className="mt-4">
          <TourItinerary tour={tour} stops={orderedStops} />
        </TabsContent>
        <TabsContent value="logistics" className="mt-4">
          <TourLogistics stops={orderedStops} />
        </TabsContent>
        <TabsContent value="budget" className="mt-4">
          <TourBudget tour={tour} stops={orderedStops} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
