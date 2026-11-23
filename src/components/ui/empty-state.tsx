import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/** "Nothing here yet" — says what to do next instead of just "Aucun…". */
export function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
  className,
  compact,
}: {
  icon: LucideIcon;
  title: React.ReactNode;
  hint?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center rounded-xl border border-dashed text-center', compact ? 'gap-1.5 px-4 py-6' : 'gap-2 px-6 py-14', className)}>
      <span className={cn('flex items-center justify-center rounded-full bg-muted text-muted-foreground', compact ? 'h-9 w-9' : 'h-12 w-12')}>
        <Icon className={compact ? 'h-4 w-4' : 'h-5 w-5'} />
      </span>
      <p className={cn('font-medium', compact ? 'text-sm' : 'text-base')}>{title}</p>
      {hint && <p className="max-w-sm text-xs text-muted-foreground">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
