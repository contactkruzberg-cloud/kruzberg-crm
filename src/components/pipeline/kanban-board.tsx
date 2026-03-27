'use client';

import { useState } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useUpdateDeal } from '@/hooks/use-deals';
import { STAGES, type Deal, type DealStage } from '@/types/database';
import { KanbanColumn } from './kanban-column';
import { KanbanCard } from './kanban-card';
import { toast } from 'sonner';

interface KanbanBoardProps {
  deals: Deal[];
  onDealClick: (id: string) => void;
}

export function KanbanBoard({ deals, onDealClick }: KanbanBoardProps) {
  const [activeDeal, setActiveDeal] = useState<Deal | null>(null);
  const updateDeal = useUpdateDeal();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const handleDragStart = (event: DragStartEvent) => {
    const deal = deals.find((d) => d.id === event.active.id);
    if (deal) setActiveDeal(deal);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDeal(null);
    const { active, over } = event;
    if (!over) return;

    const dealId = active.id as string;
    const newStage = over.id as DealStage;

    const deal = deals.find((d) => d.id === dealId);
    if (!deal || deal.stage === newStage) return;

    const stageLabel = STAGES.find((s) => s.key === newStage)?.label || newStage;
    updateDeal.mutate(
      { id: dealId, stage: newStage },
      {
        onSuccess: () => {
          toast.success(`Déplacé vers "${stageLabel}"`);
        },
        onError: () => {
          toast.error('Erreur lors du déplacement');
        },
      }
    );
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 overflow-x-auto pb-4">
        {STAGES.map((stage) => {
          const stageDeals = deals.filter((d) => d.stage === stage.key);
          return (
            <KanbanColumn
              key={stage.key}
              stage={stage}
              count={stageDeals.length}
            >
              <SortableContext
                items={stageDeals.map((d) => d.id)}
                strategy={verticalListSortingStrategy}
              >
                {stageDeals.map((deal) => (
                  <KanbanCard
                    key={deal.id}
                    deal={deal}
                    onClick={() => onDealClick(deal.id)}
                  />
                ))}
              </SortableContext>
              {stageDeals.length === 0 && (
                <div className="text-center py-8 text-xs text-muted-foreground">
                  Déposez ici
                </div>
              )}
            </KanbanColumn>
          );
        })}
      </div>

      <DragOverlay>
        {activeDeal && <KanbanCard deal={activeDeal} onClick={() => {}} isDragging />}
      </DragOverlay>
    </DndContext>
  );
}
