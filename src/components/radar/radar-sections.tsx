'use client';

import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Orbit, Radar } from 'lucide-react';
import { ConstellationView } from '@/components/constellation/constellation-view';
import { cn } from '@/lib/utils';
import { RadarView } from './radar-view';

export type RadarSection = 'pistes' | 'constellation';

const SECTIONS: { id: RadarSection; label: string; icon: typeof Radar; hint: string }[] = [
  { id: 'pistes', label: 'Pistes', icon: Radar, hint: 'Les pistes trouvées par la veille booking, à trier, écrire et passer au pipeline.' },
  { id: 'constellation', label: 'Constellation', icon: Orbit, hint: 'Les acteurs (tourneurs, labels, lieux…) qui reviennent chez les groupes de notre niche.' },
];

/** Radar = deux faces de la prospection : les pistes de la veille et la constellation de la niche. */
export function RadarSections({ initial }: { initial: RadarSection }) {
  const router = useRouter();
  const pathname = usePathname();
  const [section, setSection] = useState<RadarSection>(initial);

  const select = (id: RadarSection) => {
    setSection(id);
    router.replace(id === 'pistes' ? pathname : `${pathname}?vue=${id}`, { scroll: false });
  };

  return (
    <div className="space-y-5">
      <div role="tablist" aria-label="Sections du radar" className="inline-flex rounded-lg border bg-card p-1">
        {SECTIONS.map((s) => {
          const on = section === s.id;
          return (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={on}
              title={s.hint}
              onClick={() => select(s.id)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                on ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <s.icon className="h-4 w-4" />
              {s.label}
            </button>
          );
        })}
      </div>
      {section === 'constellation' ? <ConstellationView /> : <RadarView />}
    </div>
  );
}
