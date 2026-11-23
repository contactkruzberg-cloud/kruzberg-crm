'use client';

import { useDeals } from '@/hooks/use-deals';
import { daysUntil } from '@/lib/utils';

const CLOSED = ['a_contacter', 'confirme', 'termine', 'refuse'];

/** Small counters shown next to menu entries (deals are already cached app-wide). */
export function useNavBadges(): Record<string, number> {
  const { data: deals } = useDeals();
  const relances = (deals || []).filter((d) => !CLOSED.includes(d.stage) && d.next_relance_at && daysUntil(d.next_relance_at) <= 0).length;
  return { '/relances': relances };
}
