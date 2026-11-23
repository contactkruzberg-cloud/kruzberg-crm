'use client';

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useTours } from '@/hooks/use-tours';
import { useAllTourStops } from '@/hooks/use-tour-stops';
import { useAllTourExpenses } from '@/hooks/use-tour-expenses';
import { TourCard } from '@/components/tours/tour-card';
import { CreateTourDialog } from '@/components/tours/create-tour-dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Route } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/ui/empty-state';

export default function ToursPage() {
  const { data: tours, isLoading } = useTours();
  const { data: stops } = useAllTourStops();
  const { data: expenses } = useAllTourExpenses();
  const [createOpen, setCreateOpen] = useState(false);

  const stopsByTour = useMemo(() => {
    const map = new Map<string, typeof stops>();
    (stops || []).forEach((s) => {
      const arr = map.get(s.tour_id) || [];
      arr.push(s);
      map.set(s.tour_id, arr);
    });
    return map;
  }, [stops]);

  const expensesByTour = useMemo(() => {
    const map = new Map<string, typeof expenses>();
    (expenses || []).forEach((e) => {
      const arr = map.get(e.tour_id) || [];
      arr.push(e);
      map.set(e.tour_id, arr);
    });
    return map;
  }, [expenses]);

  return (
    <div className="space-y-4">
      <PageHeader
        icon={Route}
        title={<>Tournées <span className="text-sm font-normal text-muted-foreground">({tours?.length || 0})</span></>}
        actions={
        <Button size="sm" className="gap-2" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          Nouvelle tournée
        </Button>
        }
      />

      {isLoading ? (
        <div className="max-w-4xl space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      ) : tours && tours.length > 0 ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-4xl divide-y border-y">
          {tours.map((tour) => (
            <TourCard
              key={tour.id}
              tour={tour}
              stops={stopsByTour.get(tour.id) || []}
              expenses={expensesByTour.get(tour.id) || []}
            />
          ))}
        </motion.div>
      ) : (
        <EmptyState
          icon={Route}
          title="Aucune tournée"
          hint="Regroupe des dates confirmées pour planifier trajets, hôtels et budget."
          action={
            <Button size="sm" className="gap-2" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              Nouvelle tournée
            </Button>
          }
        />
      )}

      <CreateTourDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
