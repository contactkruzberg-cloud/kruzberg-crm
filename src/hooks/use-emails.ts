'use client';

import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useSupabase } from './use-supabase';
import type { EmailRow } from '@/lib/email/messages';

// Mail in the CRM: the local copy of booking@ (table `emails`), kept in sync
// with the mailbox while the app is open.

const KEY = ['emails'];
const COLUMNS = 'id, message_id, folder, uid, direction, from_addr, from_name, to_addrs, cc_addrs, peers, peer_domains, subject, sent_at, body_text, in_reply_to, refs, has_attachments, seen';

/** The table does not exist until migration 020 has been run. */
export const isSetupError = (e: unknown) => e instanceof Error && /emails|email_sync_state/.test(e.message) && /does not exist|could not find|schema cache|activée/i.test(e.message);

export function useEmails() {
  const supabase = useSupabase();
  return useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const rows: EmailRow[] = [];
      // PostgREST returns 1000 rows per request: page through (newest first).
      for (let from = 0; from < 10_000; from += 1000) {
        const { data, error } = await supabase.from('emails').select(COLUMNS).order('sent_at', { ascending: false }).range(from, from + 999);
        if (error) throw new Error(error.message);
        rows.push(...((data ?? []) as unknown as EmailRow[]));
        if (!data || data.length < 1000) break;
      }
      return rows.map((r) => ({ ...r, full_text: null }));
    },
    staleTime: 30_000,
    retry: (n, e) => !isSetupError(e) && n < 2,
  });
}

/** Full text of one message, loaded on demand. */
export function useFullText(id: string | null) {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ['email_full', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from('emails').select('full_text').eq('id', id!).single();
      if (error) throw new Error(error.message);
      return (data?.full_text as string | null) ?? '';
    },
  });
}

interface SyncResponse {
  inserted: number;
  remaining: boolean;
  newReplies: number;
  error?: string;
  setup?: boolean;
}

async function syncOnce(): Promise<SyncResponse> {
  const res = await fetch('/api/email/sync');
  const body = (await res.json().catch(() => ({}))) as SyncResponse;
  if (!res.ok) throw Object.assign(new Error(body.error || `Erreur ${res.status}`), { setup: body.setup });
  return body;
}

// One sync at a time in this tab, whoever starts it (auto-sync, ⟳ button, Messages page).
let running: Promise<unknown> | null = null;

/** Sync until the mailbox is caught up (a first sync of years of mail takes several rounds). */
export function useSyncEmails() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ quiet }: { quiet?: boolean } = {}) => {
      if (running) {
        await running;
        return { inserted: 0, newReplies: 0, quiet: true };
      }
      let release!: () => void;
      running = new Promise<void>((r) => (release = r));
      let inserted = 0;
      let newReplies = 0;
      const id = quiet ? undefined : toast.loading('Synchronisation des mails…');
      try {
        for (let round = 0; round < 40; round++) {
          const r = await syncOnce();
          inserted += r.inserted;
          newReplies += r.newReplies;
          if (inserted) qc.invalidateQueries({ queryKey: KEY });
          if (!r.remaining) break;
          if (id) toast.loading(`Synchronisation des mails… ${inserted} récupérés`, { id });
        }
      } finally {
        if (id) toast.dismiss(id);
        running = null;
        release();
      }
      return { inserted, newReplies, quiet };
    },
    onSuccess: ({ inserted, newReplies, quiet }) => {
      if (newReplies) {
        qc.invalidateQueries({ queryKey: ['deals'] });
        qc.invalidateQueries({ queryKey: ['activities'] });
        toast.success(`${newReplies} nouvelle${newReplies > 1 ? 's' : ''} réponse${newReplies > 1 ? 's' : ''} : opportunité${newReplies > 1 ? 's' : ''} passée${newReplies > 1 ? 's' : ''} en « Répondu »`);
      } else if (!quiet) toast.success(inserted ? `${inserted} mail${inserted > 1 ? 's' : ''} récupéré${inserted > 1 ? 's' : ''}` : 'Boîte à jour');
    },
    onError: (e: Error & { setup?: boolean }, vars) => {
      if (!vars?.quiet || !e.setup) toast.error(e.message);
    },
  });
}

/** Keeps the CRM in step with the mailbox while it is open: at launch, then every 3 minutes. */
export function useAutoMailSync() {
  const sync = useSyncEmails();
  const syncRef = useRef(sync);
  useEffect(() => {
    syncRef.current = sync;
  });
  useEffect(() => {
    let stopped = false;
    const run = () => {
      if (!stopped && document.visibilityState === 'visible' && !syncRef.current.isPending) syncRef.current.mutate({ quiet: true });
    };
    const first = setTimeout(run, 4_000);
    const every = setInterval(run, 3 * 60_000);
    return () => {
      stopped = true;
      clearTimeout(first);
      clearInterval(every);
    };
  }, []);
}

export function useMarkSeen() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      if (!ids.length) return;
      qc.setQueryData<EmailRow[]>(KEY, (rows) => rows?.map((r) => (ids.includes(r.id) ? { ...r, seen: true } : r)));
      await fetch('/api/email/seen', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ids }) });
    },
  });
}

export interface SendParams {
  to: string;
  cc?: string;
  subject: string;
  emailBody: string;
  inReplyTo?: string | null;
  references?: string | null;
  dealId?: string;
  venueId?: string;
  contactId?: string;
}

export function useSendMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: SendParams) => {
      const res = await fetch('/api/email/send', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(p) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `Erreur ${res.status}`);
      return body as { messageId: string };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ['deals'] });
      qc.invalidateQueries({ queryKey: ['activities'] });
    },
    onError: (e: Error) => toast.error(`Envoi impossible : ${e.message}`),
  });
}
