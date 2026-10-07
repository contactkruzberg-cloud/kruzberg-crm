'use client';

import { useDroppable } from '@dnd-kit/core';
import { Badge } from '@/components/ui/badge';
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

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex-shrink-0 w-64 lg:w-72 rounded-xl border bg-card/50 p-3 transition-all duration-200',
        isOver && 'border-primary/50 bg-primary/5 shadow-lg'
      )}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={cn('w-2 h-2 rounded-full', `bg-current`)} style={{
            color: `hsl(var(--${stage.color.replace('stage-', 'stage-')}))`
          }} />
          <h3 className="text-sm font-medium">{stage.label}</h3>
        </div>
        <div className="flex items-center gap-1.5">
          {headerAction}
          <Badge variant="secondary" className="text-xs">
            {count}
          </Badge>
        </div>
      </div>
      <div className="space-y-2 min-h-[100px]">{children}</div>
    </div>
  );
}
