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
        'flex w-[17rem] shrink-0 flex-col rounded-[18px] bg-secondary/60 transition-colors duration-150 lg:w-[18.5rem] dark:bg-white/[0.035]',
        isOver && 'bg-primary/10 ring-2 ring-primary/40',
      )}
    >
      <div className="flex items-center justify-between gap-2 px-3.5 pb-1.5 pt-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
          <h3 className="truncate text-[13.5px] font-semibold">{stage.label}</h3>
          <span className="nums text-[13px] text-muted-foreground">{count}</span>
        </div>
        {headerAction}
      </div>
      <div className="min-h-[120px] flex-1 space-y-2 p-2">
        {children}
        {count === 0 && (
          <div className={cn('flex h-24 items-center justify-center rounded-xl border border-dashed text-xs text-muted-foreground/60', isOver && 'border-primary/50 text-primary')}>
            Glisse une carte ici
          </div>
        )}
      </div>
    </div>
  );
}
