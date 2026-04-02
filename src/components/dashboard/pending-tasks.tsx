'use client';

import { useTasks, useUpdateTask } from '@/hooks/use-tasks';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { cn, formatDate, daysUntil } from '@/lib/utils';
import { ListTodo, CheckCircle2, Circle, Clock } from 'lucide-react';
import Link from 'next/link';

export function PendingTasks() {
  const { data: tasks, isLoading } = useTasks();
  const updateTask = useUpdateTask();

  if (isLoading) {
    return (
      <Card>
        <CardHeader><Skeleton className="h-6 w-40" /></CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12" />)}
        </CardContent>
      </Card>
    );
  }

  const pending = (tasks || [])
    .filter((t) => !t.completed_at)
    .sort((a, b) => {
      // Overdue first, then by due date
      if (a.due_date && b.due_date) return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
      if (a.due_date) return -1;
      if (b.due_date) return 1;
      return 0;
    })
    .slice(0, 8);

  const overdueCount = pending.filter((t) => t.due_date && new Date(t.due_date) < new Date()).length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ListTodo className="h-4 w-4 text-primary" />
          Tâches à faire
        </CardTitle>
        <div className="flex gap-1.5">
          {pending.length > 0 && (
            <Badge variant="secondary">{pending.length}</Badge>
          )}
          {overdueCount > 0 && (
            <Badge variant="destructive">{overdueCount} en retard</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {pending.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <CheckCircle2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Aucune tâche en cours</p>
            <p className="text-xs mt-1">Ajoutez des tâches depuis vos opportunités</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {pending.map((task) => {
              const isOverdue = task.due_date && new Date(task.due_date) < new Date();
              const venueName = task.deal?.venue
                ? (task.deal.venue as { name: string }).name
                : task.venue?.name;

              return (
                <div
                  key={task.id}
                  className={cn(
                    'flex items-start gap-2.5 p-2.5 rounded-lg transition-colors hover:bg-muted/50',
                    isOverdue && 'bg-red-500/5'
                  )}
                >
                  <button
                    className="mt-0.5 shrink-0"
                    onClick={() => updateTask.mutate({
                      id: task.id,
                      completed_at: new Date().toISOString(),
                    })}
                  >
                    <Circle className={cn('h-4 w-4', isOverdue ? 'text-red-500' : 'text-muted-foreground hover:text-primary')} />
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{task.title}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {venueName && (
                        <span className="text-[10px] text-muted-foreground">{venueName}</span>
                      )}
                      {task.due_date && (
                        <span className={cn(
                          'text-[10px] flex items-center gap-0.5',
                          isOverdue ? 'text-red-500 font-medium' : 'text-muted-foreground'
                        )}>
                          <Clock className="h-2.5 w-2.5" />
                          {isOverdue
                            ? `${Math.abs(daysUntil(task.due_date))}j de retard`
                            : daysUntil(task.due_date) === 0
                            ? "Aujourd'hui"
                            : daysUntil(task.due_date) <= 2
                            ? `Dans ${daysUntil(task.due_date)}j`
                            : formatDate(task.due_date)
                          }
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
