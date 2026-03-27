'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDeals } from '@/hooks/use-deals';
import { KanbanBoard } from '@/components/pipeline/kanban-board';
import { PipelineTable } from '@/components/pipeline/pipeline-table';
import { DealSidePanel } from '@/components/pipeline/deal-side-panel';
import { CreateDealDialog } from '@/components/pipeline/create-deal-dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Kanban, Table2 } from 'lucide-react';
import { useSearchParams } from 'next/navigation';

export default function PipelinePage() {
  const { data: deals, isLoading } = useDeals();
  const [view, setView] = useState<'kanban' | 'table'>('kanban');
  const [selectedDealId, setSelectedDealId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const searchParams = useSearchParams();

  // Open deal from URL params
  const urlDealId = searchParams.get('deal');
  const activeDealId = selectedDealId || urlDealId;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-96" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold">Pipeline</h1>
          <Tabs value={view} onValueChange={(v) => setView(v as 'kanban' | 'table')}>
            <TabsList>
              <TabsTrigger value="kanban" className="gap-2">
                <Kanban className="h-3.5 w-3.5" />
                Kanban
              </TabsTrigger>
              <TabsTrigger value="table" className="gap-2">
                <Table2 className="h-3.5 w-3.5" />
                Table
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <Button size="sm" className="gap-2" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          Nouvelle opportunité
        </Button>
      </div>

      {/* View */}
      <AnimatePresence mode="wait">
        <motion.div
          key={view}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
        >
          {view === 'kanban' ? (
            <KanbanBoard
              deals={deals || []}
              onDealClick={(id) => setSelectedDealId(id)}
            />
          ) : (
            <PipelineTable
              deals={deals || []}
              onDealClick={(id) => setSelectedDealId(id)}
            />
          )}
        </motion.div>
      </AnimatePresence>

      {/* Side panel */}
      {activeDealId && (
        <DealSidePanel
          dealId={activeDealId}
          onClose={() => setSelectedDealId(null)}
        />
      )}

      {/* Create dialog */}
      <CreateDealDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
