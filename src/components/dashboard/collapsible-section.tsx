'use client';

import { ChevronDown } from 'lucide-react';
import { usePersistentState } from '@/lib/persistent-state';
import { cn } from '@/lib/utils';

/** Dashboard section that can be folded; the choice is remembered. */
export function CollapsibleSection({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  const [collapsed, setCollapsed] = usePersistentState<boolean>(`dash:collapsed:${id}`, false);
  return (
    <section className="space-y-3">
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground"
        aria-expanded={!collapsed}
      >
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', collapsed && '-rotate-90')} />
        {title}
      </button>
      {!collapsed && children}
    </section>
  );
}
