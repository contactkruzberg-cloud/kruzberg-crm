'use client';

import { useState } from 'react';
import { AlarmClock, Check, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { canQuickRelance, useQuickRelance, useSnoozeRelance } from '@/hooks/use-deals';
import { RELANCE_METHODS, type Deal, type RelanceMethod } from '@/types/database';
import { cn } from '@/lib/utils';
import { RelanceDialog } from './relance-dialog';

// Channels offered first in the "Relancé" menu (most used in booking).
const MAIN_CHANNELS: RelanceMethod[] = ['email', 'instagram', 'phone', 'sms', 'whatsapp', 'facebook', 'website_form', 'in_person', 'linkedin', 'other'];

/** Stops clicks / drags from reaching the card (opens the panel, starts a dnd drag). */
const stop = {
  onClick: (e: React.SyntheticEvent) => e.stopPropagation(),
  onPointerDown: (e: React.SyntheticEvent) => e.stopPropagation(),
  onKeyDown: (e: React.SyntheticEvent) => e.stopPropagation(),
};

/** "✓ Contacté / Relancé" + "Relancer" (mail rédigé par Claude) + "Reporter" — on Kanban cards, table rows and the deal panel. */
export function DealQuickActions({ deal, size = 'xs', className }: { deal: Deal; size?: 'xs' | 'sm'; className?: string }) {
  const relance = useQuickRelance();
  const snooze = useSnoozeRelance();
  const [relanceOpen, setRelanceOpen] = useState(false);
  if (!canQuickRelance(deal)) return null;
  const first = deal.stage === 'a_contacter';
  const h = size === 'xs' ? 'h-6 text-[11px] px-2' : 'h-8 text-xs px-3';

  return (
    <div className={cn('flex flex-wrap items-center gap-1', className)} {...stop}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className={cn('gap-1', h)} disabled={relance.isPending} title={first ? 'Noter un premier contact' : 'Noter une relance'}>
            <Check className="h-3 w-3" />
            {first ? 'Contacté' : 'Relancé'}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" {...stop}>
          <DropdownMenuLabel className="text-xs">Par quel canal ?</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {MAIN_CHANNELS.map((key) => (
            <DropdownMenuItem key={key} onClick={() => relance.mutate({ deal, channel: key })}>
              {RELANCE_METHODS.find((m) => m.key === key)?.label ?? key}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {!first && (
        <>
          <Button variant="outline" className={cn('gap-1', h)} onClick={() => setRelanceOpen(true)} title="Claude rédige une relance personnalisée, à ouvrir dans Mail">
            <Sparkles className="h-3 w-3" />
            Relancer
          </Button>
          <RelanceDialog deal={deal} open={relanceOpen} onOpenChange={setRelanceOpen} />
        </>
      )}
      {!first && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className={cn('gap-1', h)} disabled={snooze.isPending} title="Reporter la prochaine relance">
              <AlarmClock className="h-3 w-3" />
              Reporter
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" {...stop}>
            <DropdownMenuLabel className="text-xs">Relancer dans…</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {[3, 7, 14, 30].map((days) => (
              <DropdownMenuItem key={days} onClick={() => snooze.mutate({ dealId: deal.id, days })}>
                {days} jours
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
