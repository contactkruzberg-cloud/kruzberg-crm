'use client';

import { useMemo } from 'react';
import { useContacts } from '@/hooks/use-contacts';
import { useDeals } from '@/hooks/use-deals';
import { useEmails } from '@/hooks/use-emails';
import { useVenues } from '@/hooks/use-venues';
import { buildConversations } from '@/lib/email/messages';
import { daysUntil } from '@/lib/utils';

const CLOSED = ['a_contacter', 'confirme', 'termine', 'refuse'];

/** Small counters shown next to menu entries (data already cached app-wide). */
export function useNavBadges(): Record<string, number> {
  const { data: deals } = useDeals();
  const { data: emails } = useEmails();
  const { data: venues } = useVenues();
  const { data: contacts } = useContacts();
  const relances = (deals || []).filter((d) => !CLOSED.includes(d.stage) && d.next_relance_at && daysUntil(d.next_relance_at) <= 0).length;
  // Unread conversations with people the CRM knows (unknown senders don't ring the bell).
  const unread = useMemo(
    () => buildConversations((emails ?? []).filter((e) => e.direction === 'in' && !e.seen), venues ?? [], contacts ?? []).filter((c) => c.kind !== 'address').length,
    [emails, venues, contacts],
  );
  return { '/relances': relances, '/messages': unread };
}
