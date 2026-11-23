import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Page title, one optional line of live information, actions on the right.
 * No decoration: the title is in the top bar on phones.
 */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  /** Kept for call sites; not displayed. */
  icon?: LucideIcon;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-x-6 gap-y-3', className)}>
      <div className="min-w-0">
        <h1 className="font-display hidden text-[30px] font-bold leading-[1.1] md:block">{title}</h1>
        {description && <p className="mt-1 text-[13px] text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
