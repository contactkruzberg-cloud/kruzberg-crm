'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, Loader2, RefreshCw, Search } from 'lucide-react';
import { useContacts } from '@/hooks/use-contacts';
import { useDeals } from '@/hooks/use-deals';
import { isSetupError, useEmails, useSyncEmails } from '@/hooks/use-emails';
import { useVenues } from '@/hooks/use-venues';
import { buildConversations, type Conversation as Conv } from '@/lib/email/messages';
import { cn } from '@/lib/utils';
import { cleanBody, withoutSignature } from '@/lib/email/text';
import { Conversation, SetupNotice, type ConversationContext } from './conversation';

type Filter = 'all' | 'unread' | 'unknown';

const when = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  if (now.getTime() - d.getTime() < 6 * 864e5) return d.toLocaleDateString('fr-FR', { weekday: 'short' });
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', ...(d.getFullYear() !== now.getFullYear() ? { year: '2-digit' } : {}) });
};
const initials = (s: string) =>
  s
    .replace(/@.*/, '')
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('') || '?';

function Row({ c, on, onClick }: { c: Conv; on: boolean; onClick: () => void }) {
  const preview = (c.last.direction === 'out' ? 'Toi : ' : '') + (withoutSignature(cleanBody(c.last.body_text)).replace(/<(https?:|mailto:)[^>]+>/g, '').split('\n').find((l) => l.trim()) || c.last.subject);
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn('flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors', on ? 'bg-primary text-primary-foreground' : 'hover:bg-secondary')}
    >
      <span className="relative shrink-0">
        <span
          className={cn(
            'flex h-10 w-10 items-center justify-center rounded-full text-[13px] font-semibold',
            on ? 'bg-white/20' : c.kind === 'address' ? 'bg-secondary text-muted-foreground' : 'bg-gradient-to-b from-neutral-400 to-neutral-500 text-white dark:from-neutral-500 dark:to-neutral-600',
          )}
        >
          {initials(c.title)}
        </span>
        {c.unread > 0 && !on && <span className="absolute -left-1 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-primary" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className={cn('truncate text-[14.5px]', c.unread ? 'font-semibold' : 'font-medium')}>{c.title}</span>
          <span className={cn('shrink-0 text-[12px]', on ? 'text-primary-foreground/80' : 'text-muted-foreground')}>{when(c.last.sent_at)}</span>
        </span>
        <span className={cn('block truncate text-[13px]', on ? 'text-primary-foreground/85' : c.unread ? 'text-foreground' : 'text-muted-foreground')}>{preview}</span>
      </span>
    </button>
  );
}

export function Inbox() {
  const emails = useEmails();
  const { data: venues } = useVenues();
  const { data: contacts } = useContacts();
  const { data: deals } = useDeals();
  const sync = useSyncEmails();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const conversations = useMemo(() => buildConversations(emails.data ?? [], venues ?? [], contacts ?? []), [emails.data, venues, contacts]);
  const shown = conversations.filter((c) => {
    if (filter === 'unread' && !c.unread) return false;
    if (filter === 'unknown' && c.kind !== 'address') return false;
    const s = q.trim().toLowerCase();
    return !s || `${c.title} ${c.subtitle} ${c.last.subject} ${c.match.addresses.join(' ')}`.toLowerCase().includes(s);
  });
  const selectedKey = params.get('c');
  const selected = conversations.find((c) => c.key === selectedKey) ?? null;
  const open = (key: string | null) => router.replace(key ? `${pathname}?c=${encodeURIComponent(key)}` : pathname, { scroll: false });

  // Who the conversation is with in the CRM: venue, contact, and the deal to log the mail on.
  const ctx = useMemo((): { context: ConversationContext; href?: string; label?: string; fallbackTo: string[] } => {
    if (!selected) return { context: {}, fallbackTo: [] };
    const venueId = selected.kind === 'venue' ? selected.ref : selected.kind === 'contact' ? (contacts ?? []).find((c) => c.id === selected.ref)?.venue_id ?? undefined : undefined;
    const contactId = selected.kind === 'contact' ? selected.ref : undefined;
    const related = (deals ?? []).filter((d) => (venueId && d.venue_id === venueId) || (contactId && d.contact_id === contactId));
    const deal = related.find((d) => !['termine', 'refuse'].includes(d.stage)) ?? related[0];
    return {
      context: { venueId, contactId, dealId: deal?.id },
      href: deal ? `/pipeline?deal=${deal.id}` : venueId ? '/venues' : undefined,
      label: deal ? 'Opportunité' : venueId ? 'Fiche du lieu' : undefined,
      fallbackTo: selected.match.addresses.slice(0, 1),
    };
  }, [selected, contacts, deals]);

  const unreadTotal = conversations.reduce((n, c) => n + c.unread, 0);

  return (
    <div className="-m-3 flex h-[calc(100dvh-3.5rem-5rem)] sm:-m-4 md:h-[calc(100dvh-3.5rem)] lg:-mx-8 lg:-my-6">
      {/* List */}
      <aside className={cn('flex w-full shrink-0 flex-col border-r md:w-[340px]', selected && 'hidden md:flex')}>
        <div className="space-y-2.5 px-3 pb-2 pt-4">
          <div className="flex items-center justify-between px-1">
            <h1 className="font-display text-[26px] font-bold leading-tight">Messages</h1>
            <button
              type="button"
              onClick={() => sync.mutate({})}
              disabled={sync.isPending}
              title="Synchroniser avec la boîte booking@"
              className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <RefreshCw className={cn('h-4 w-4', sync.isPending && 'animate-spin')} />
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Rechercher"
              className="h-9 w-full rounded-[10px] bg-secondary pl-8 pr-3 text-[14px] outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="flex rounded-[10px] bg-secondary p-[3px] text-[12.5px] font-medium">
            {(
              [
                ['all', 'Toutes'],
                ['unread', `Non lues${unreadTotal ? ` (${unreadTotal})` : ''}`],
                ['unknown', 'Inconnus'],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setFilter(k)}
                className={cn('flex-1 rounded-[7px] py-1 transition-colors', filter === k ? 'bg-card shadow-[0_1px_3px_hsl(0_0%_0%/0.12)] dark:bg-white/15' : 'text-muted-foreground')}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          {isSetupError(emails.error) ? (
            <SetupNotice />
          ) : emails.isLoading ? (
            <div className="flex justify-center py-10 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : shown.length === 0 ? (
            <p className="px-3 py-10 text-center text-[14px] text-muted-foreground">
              {conversations.length ? 'Aucune conversation ne correspond.' : 'Aucun mail synchronisé pour l’instant. La première synchronisation peut prendre quelques minutes.'}
            </p>
          ) : (
            shown.map((c) => <Row key={c.key} c={c} on={c.key === selected?.key} onClick={() => open(c.key)} />)
          )}
        </div>
      </aside>

      {/* Thread */}
      <section className={cn('min-w-0 flex-1 flex-col', selected ? 'flex' : 'hidden md:flex')}>
        {selected ? (
          <>
            <header className="flex items-center gap-2 border-b px-3 py-2.5 md:px-5">
              <button type="button" onClick={() => open(null)} className="-ml-1 flex items-center text-primary md:hidden" aria-label="Retour">
                <ChevronLeft className="h-6 w-6" />
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold">{selected.title}</p>
                <p className="truncate text-[12.5px] text-muted-foreground">
                  {[selected.subtitle, selected.kind === 'address' ? 'pas encore dans le CRM' : `${selected.count} mail${selected.count > 1 ? 's' : ''}`].filter(Boolean).join(' · ')}
                </p>
              </div>
              {ctx.href && (
                <Link href={ctx.href} className="shrink-0 text-[13px] text-primary hover:underline">
                  {ctx.label}
                </Link>
              )}
            </header>
            <Conversation key={selected.key} match={selected.match} fallbackTo={ctx.fallbackTo} context={ctx.context} className="flex-1 px-2 pb-2 md:px-5" />
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-[14px] text-muted-foreground">Choisis une conversation.</div>
        )}
      </section>
    </div>
  );
}
