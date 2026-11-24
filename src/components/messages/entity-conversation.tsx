'use client';

import { useMemo } from 'react';
import { useContacts } from '@/hooks/use-contacts';
import { useDeals } from '@/hooks/use-deals';
import { useEmails } from '@/hooks/use-emails';
import { addressesIn, contactMatch, matches, mergeMatch, venueMatch, type ContactLike, type Match, type VenueLike } from '@/lib/email/messages';
import type { Deal } from '@/types/database';
import { Conversation } from './conversation';

// The same chat, scoped to a deal, a venue or a contact.

const NONE: Match = { addresses: [], domains: [] };

function useDealMatch(deal: Deal): { match: Match; fallbackTo: string[] } {
  const { data: contacts } = useContacts();
  return useMemo(() => {
    const parts: Match[] = [];
    if (deal.venue) parts.push(venueMatch(deal.venue as VenueLike, (contacts ?? []) as ContactLike[]));
    if (deal.contact) parts.push(contactMatch(deal.contact as ContactLike));
    const match = parts.length ? mergeMatch(...parts) : NONE;
    const fallbackTo = [...addressesIn(deal.contact?.email), ...addressesIn(deal.venue?.email)].slice(0, 1);
    return { match, fallbackTo };
  }, [deal.venue, deal.contact, contacts]);
}

export function DealConversation({ deal, className, readOnly }: { deal: Deal; className?: string; readOnly?: boolean }) {
  const { match, fallbackTo } = useDealMatch(deal);
  return (
    <Conversation
      match={match}
      fallbackTo={fallbackTo}
      context={{ dealId: deal.id, venueId: deal.venue_id ?? undefined, contactId: deal.contact_id ?? undefined }}
      emptyLabel={fallbackTo.length ? 'Aucun mail échangé avec ce lieu pour l’instant.' : 'Ajoute un email au lieu ou au contact pour retrouver vos échanges ici.'}
      className={className}
      readOnly={readOnly}
    />
  );
}

export function VenueConversation({ venue, className }: { venue: VenueLike; className?: string }) {
  const { data: contacts } = useContacts();
  const { data: deals } = useDeals();
  const match = useMemo(() => venueMatch(venue, (contacts ?? []) as ContactLike[]), [venue, contacts]);
  const deal = (deals ?? []).filter((d) => d.venue_id === venue.id).find((d) => !['termine', 'refuse'].includes(d.stage));
  return (
    <Conversation
      match={match}
      fallbackTo={match.addresses.slice(0, 1)}
      context={{ venueId: venue.id, dealId: deal?.id }}
      emptyLabel={match.addresses.length ? 'Aucun mail échangé avec ce lieu pour l’instant.' : 'Ajoute un email au lieu ou à un contact pour retrouver vos échanges ici.'}
      className={className}
    />
  );
}

export function ContactConversation({ contact, className }: { contact: ContactLike; className?: string }) {
  const { data: deals } = useDeals();
  const match = useMemo(() => contactMatch(contact), [contact]);
  const deal = (deals ?? []).find((d) => (d.contact_id === contact.id || (contact.venue_id && d.venue_id === contact.venue_id)) && !['termine', 'refuse'].includes(d.stage));
  return (
    <Conversation
      match={match}
      fallbackTo={match.addresses.slice(0, 1)}
      context={{ contactId: contact.id, venueId: contact.venue_id ?? undefined, dealId: deal?.id }}
      emptyLabel={match.addresses.length ? `Aucun mail échangé avec ${contact.name} pour l’instant.` : 'Ce contact n’a pas d’adresse email.'}
      className={className}
    />
  );
}

/** Unread count for a match (tab badges). */
export function useUnread(match: Match) {
  const { data } = useEmails();
  return (data ?? []).filter((e) => e.direction === 'in' && !e.seen && matches(e, match)).length;
}
