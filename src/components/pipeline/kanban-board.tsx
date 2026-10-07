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
  /** Why a deal matched the search, when not visible on the card. */
  hints?: Map<string, string>;
  /** While searching, only show the stages that have results. */
  hideEmptyColumns?: boolean;
  selectedIds: Set<string>;
  /** Select / deselect these deals. */
  onSelect: (ids: string[], selected: boolean) => void;
  /** A selected card was dropped on a column: move the whole selection. */
  onMoveSelected: (stage: DealStage) => void;
}

export function KanbanBoard({ deals, onDealClick, hints, hideEmptyColumns, selectedIds, onSelect, onMoveSelected }: KanbanBoardProps) {
  const selectionMode = selectedIds.size > 0;
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

    if (selectedIds.has(dealId) && selectedIds.size > 1) {
      onMoveSelected(newStage);
      return;
    }

    const deal = deals.find((d) => d.id === dealId);
    if (!deal || deal.stage === newStage) return;

    const stageLabel = STAGES.find((s) => s.key === newStage)?.label || newStage;
    const updates: { id: string; stage: DealStage; last_message_at?: string } = {
      id: dealId,
      stage: newStage,
    };
    if (deal.stage === 'a_contacter' && newStage === 'contacte') {
      updates.last_message_at = new Date().toISOString();
    }
    updateDeal.mutate(
      updates,
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
          if (hideEmptyColumns && stageDeals.length === 0) return null;
          const selectedInColumn = stageDeals.filter((d) => selectedIds.has(d.id)).length;
          const allSelected = stageDeals.length > 0 && selectedInColumn === stageDeals.length;
          return (
            <KanbanColumn
              key={stage.key}
              stage={stage}
              count={stageDeals.length}
              headerAction={
                stageDeals.length > 0 && (
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 cursor-pointer accent-[hsl(var(--primary))]"
                    title={allSelected ? 'Tout désélectionner dans cette colonne' : 'Tout sélectionner dans cette colonne'}
                    aria-label="Tout sélectionner dans cette colonne"
                    checked={allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = selectedInColumn > 0 && !allSelected;
                    }}
                    onChange={() => onSelect(stageDeals.map((d) => d.id), !allSelected)}
                  />
                )
              }
            >
              <SortableContext
                items={stageDeals.map((d) => d.id)}
                strategy={verticalListSortingStrategy}
              >
                {stageDeals.map((deal) => (
                  <KanbanCard
                    key={deal.id}
                    deal={deal}
                    hint={hints?.get(deal.id)}
                    onClick={() => onDealClick(deal.id)}
                    selected={selectedIds.has(deal.id)}
                    selectionMode={selectionMode}
                    onToggleSelect={() => onSelect([deal.id], !selectedIds.has(deal.id))}
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
        {activeDeal && (
          <div className="relative">
            <KanbanCard deal={activeDeal} onClick={() => {}} isDragging selected={selectedIds.has(activeDeal.id)} />
            {selectedIds.has(activeDeal.id) && selectedIds.size > 1 && (
              <span className="absolute -top-2 -right-2 rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground">
                {selectedIds.size}
              </span>
            )}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
