'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { DealConversation } from '@/components/messages/entity-conversation';
import { freshDraft } from '@/components/pipeline/relance-dialog';
import { useMarkRelanceSent, useRelanceDocs, useRequestRelance } from '@/hooks/use-relance';
import { cn } from '@/lib/utils';
import type { Deal } from '@/types/database';

function Elapsed({ since }: { since: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const s = Math.max(0, Math.round((now - Date.parse(since)) / 1000));
  return <>{s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')}`}</>;
}

/**
 * A follow-up, written where the conversation is: Claude's draft lands in the
 * reply box, Greg reads it, edits it and sends it himself (nothing leaves
 * without his click). Sending logs the follow-up and schedules the next one.
 */
export function RelanceConversation({ deal, autoRequest = false, onSent, className }: { deal: Deal; autoRequest?: boolean; onSent?: () => void; className?: string }) {
  const docs = useRelanceDocs();
  const doc = docs.data?.get(deal.id);
  const request = useRequestRelance();
  const markSent = useMarkRelanceSent();
  const [note, setNote] = useState('');
  const asked = useRef(false);

  const ready = freshDraft(doc, deal);
  const writing = doc?.state === 'requested' || request.isPending;

  const ask = (consigne?: string) =>
    request.mutate({ dealId: deal.id, note: consigne }, { onSuccess: () => setNote(''), onError: (e) => toast.error(e.message) });

  // Opened from « Relancer »: ask for a draft unless one is ready or on its way.
  useEffect(() => {
    if (!autoRequest || asked.current || !docs.isSuccess) return;
    asked.current = true;
    if (!ready && doc?.state !== 'requested') ask();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRequest, docs.isSuccess]);

  const draft = useMemo(
    () =>
      ready && doc
        ? {
            key: `${deal.id}:${doc.readyAt ?? doc.requestedAt}`,
            to: doc.to || '',
            subject: doc.subject || '',
            body: doc.body || '',
            inReplyTo: doc.thread?.messageId ?? null,
            references: [doc.thread?.references, doc.thread?.messageId].filter(Boolean).join(' ') || null,
          }
        : null,
    [ready, doc, deal.id],
  );

  const bar = (
    <div className={cn('mb-2 flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 text-[13px]', ready ? 'bg-primary/[0.08]' : 'bg-secondary')}>
      {writing ? (
        <span className="flex items-center gap-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" /> Claude rédige la relance…
          {doc?.requestedAt && doc.state === 'requested' && (
            <span className="text-muted-foreground">
              (<Elapsed since={doc.requestedAt} />, en général 2 à 4 min — tu peux passer à une autre relance)
            </span>
          )}
        </span>
      ) : ready ? (
        <span className="flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-primary" /> Brouillon de Claude dans la zone de réponse : relis, modifie, puis envoie.
        </span>
      ) : (
        <>
          {doc?.state === 'error' && <span className="text-[hsl(var(--status-urgent))]">Claude n’a pas pu rédiger{doc.error ? ` : ${doc.error}` : ''}.</span>}
          <button type="button" onClick={() => ask(note.trim() || undefined)} className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 font-medium text-primary-foreground">
            <Sparkles className="h-3.5 w-3.5" /> Rédiger la relance avec Claude
          </button>
          <span className="text-muted-foreground">ou écris-la toi-même ci-dessous.</span>
        </>
      )}
      {!writing && (ready || doc?.state === 'error') && (
        <span className="ml-auto flex min-w-[220px] flex-1 items-center gap-1.5 sm:flex-none">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && ask(note.trim() || undefined)}
            placeholder="Consigne (plus court, en anglais…)"
            className="h-7 min-w-0 flex-1 rounded-md bg-card px-2 text-[12.5px] outline-none focus-visible:outline-none"
          />
          <button type="button" onClick={() => ask(note.trim() || undefined)} className="flex shrink-0 items-center gap-1 text-primary hover:underline">
            <RefreshCw className="h-3 w-3" /> Autre version
          </button>
        </span>
      )}
    </div>
  );

  return (
    <DealConversation
      deal={deal}
      draft={draft}
      composerTop={bar}
      sendExtra={{ relance: true }}
      onSent={() => {
        if (doc) markSent.mutate(deal.id);
        onSent?.();
      }}
      className={className}
    />
  );
}
