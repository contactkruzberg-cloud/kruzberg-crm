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
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Route className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold">Tournées</h1>
          <span className="text-sm text-muted-foreground">({tours?.length || 0})</span>
        </div>
        <Button size="sm" className="gap-2" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          Nouvelle tournée
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      ) : tours && tours.length > 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
        >
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
        <div className="flex flex-col items-center justify-center gap-3 h-72 border rounded-xl border-dashed text-center">
          <Route className="h-10 w-10 text-muted-foreground/40" />
          <div>
            <p className="font-medium">Aucune tournée pour l&apos;instant</p>
            <p className="text-sm text-muted-foreground">
              Crée une tournée et regroupe tes dates confirmées pour planifier trajets, hôtels et budget.
            </p>
          </div>
          <Button size="sm" className="gap-2" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            Nouvelle tournée
          </Button>
        </div>
      )}

      <CreateTourDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
