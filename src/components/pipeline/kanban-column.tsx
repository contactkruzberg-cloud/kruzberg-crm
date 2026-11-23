'use client';

import { useDroppable } from '@dnd-kit/core';
import { cn } from '@/lib/utils';
import type { DealStage } from '@/types/database';

interface KanbanColumnProps {
  stage: { key: DealStage; label: string; color: string };
  count: number;
  /** Selection checkbox for the whole column. */
  headerAction?: React.ReactNode;
  children: React.ReactNode;
}

export function KanbanColumn({ stage, count, headerAction, children }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.key });
  const color = `hsl(var(--${stage.color}))`;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex w-[16.5rem] shrink-0 flex-col rounded-2xl transition-colors duration-150 lg:w-[17.5rem]',
        isOver && 'bg-primary/[0.06]',
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b px-1 pb-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
          <h3 className="truncate text-[13.5px] font-semibold">{stage.label}</h3>
          <span className="nums text-[13px] text-muted-foreground">{count}</span>
        </div>
        {headerAction}
      </div>
      <div className="min-h-[120px] flex-1 space-y-2 py-2.5">
        {children}
        {count === 0 && (
          <p className={cn('px-1 py-3 text-[13px] text-muted-foreground/60', isOver && 'text-primary')}>Aucune</p>
        )}
      </div>
    </div>
  );
}
