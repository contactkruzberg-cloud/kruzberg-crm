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
        className="font-display flex items-center gap-1.5 text-[17px] font-semibold text-foreground hover:opacity-80"
        aria-expanded={!collapsed}
      >
        <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', collapsed && '-rotate-90')} />
        {title}
      </button>
      {!collapsed && children}
    </section>
  );
}
