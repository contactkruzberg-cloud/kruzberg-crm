import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * En-tête commun à toutes les pages : icône + titre (le titre est dans la barre
 * du haut sur mobile), une ligne d'explication, les actions à droite.
 */
export function PageHeader({
  icon: Icon,
  title,
  description,
  actions,
  className,
}: {
  icon: LucideIcon;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-3', className)}>
      <div className="min-w-0">
        <h1 className="font-display hidden items-center gap-2.5 text-[28px] font-bold leading-tight md:flex">
          <Icon className="h-6 w-6 shrink-0 text-primary" strokeWidth={2} />
          {title}
        </h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
