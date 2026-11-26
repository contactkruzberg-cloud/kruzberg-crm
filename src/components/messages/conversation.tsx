'use client';

import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowUp, Link2, Loader2, Paperclip } from 'lucide-react';
import { toast } from 'sonner';
import { isSetupError, useEmails, useFullText, useMarkSeen, useSendMessage } from '@/hooks/use-emails';
import { matches, replySubject, replyTarget, type EmailRow, type Match } from '@/lib/email/messages';
import { cn } from '@/lib/utils';
import { cleanBody, linkify, prettyUrl, withoutSignature } from '@/lib/email/text';
import { insertLink, normalizeHref, pastedHtmlToComposer } from '@/lib/email/compose';

const dayLabel = (iso: string) => {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date(Date.now() - 864e5);
  if (d.toDateString() === today.toDateString()) return "Aujourd'hui";
  if (d.toDateString() === y.toDateString()) return 'Hier';
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', ...(d.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {}) });
};
const time = (iso: string) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
const baseSubject = (s: string) => s.replace(/^\s*((re|tr|fwd?|aw)\s*:\s*)+/i, '').trim().toLowerCase();

export function SetupNotice() {
  return (
    <div className="m-4 rounded-xl bg-[hsl(var(--status-warning))]/10 p-4 text-[13px]">
      <p className="font-medium">La messagerie n’est pas encore activée.</p>
      <p className="mt-1 text-muted-foreground">
        Dans Supabase → SQL Editor, exécute le fichier <code>supabase/migrations/020_emails.sql</code>, puis recharge la page : tes mails se synchroniseront tout seuls.
      </p>
    </div>
  );
}

/** Body text with real, readable links (label instead of a long URL). */
function MessageText({ text, out }: { text: string; out: boolean }) {
  return (
    <p className="whitespace-pre-wrap break-words">
      {text.split('\n').map((line, i) => (
        <Fragment key={i}>
          {i > 0 && '\n'}
          {linkify(line).map((t, j) =>
            t.t === 'text' ? (
              <Fragment key={j}>{t.v}</Fragment>
            ) : (
              <a
                key={j}
                href={t.href}
                target={t.href.startsWith('mailto:') ? undefined : '_blank'}
                rel="noopener noreferrer"
                title={t.href.replace(/^mailto:/, '')}
                className={cn('underline decoration-1 underline-offset-2', out ? 'text-primary-foreground decoration-primary-foreground/50' : 'text-primary decoration-primary/40')}
              >
                {t.label}
              </a>
            ),
          )}
        </Fragment>
      ))}
    </p>
  );
}

function Bubble({ m, showSubject }: { m: EmailRow; showSubject: boolean }) {
  const out = m.direction === 'out';
  const [quoted, setQuoted] = useState(false);
  const full = useFullText(quoted ? m.id : null);
  const text = withoutSignature(cleanBody(m.body_text)) || cleanBody(m.body_text) || '(message sans texte)';

  return (
    <div className={cn('flex', out ? 'justify-end' : 'justify-start')}>
      <div className={cn('max-w-[82%] sm:max-w-[72%]')}>
        {!out && m.from_name && <p className="mb-0.5 ml-3 text-[11px] text-muted-foreground">{m.from_name}</p>}
        <div
          className={cn(
            'rounded-[20px] px-3.5 py-2 text-[14.5px] leading-[1.4]',
            out
              ? 'bubble-out rounded-br-md bg-primary text-primary-foreground'
              : 'rounded-bl-md bg-secondary text-foreground dark:bg-white/10',
          )}
        >
          {showSubject && m.subject && <p className={cn('mb-1 text-[12.5px] font-semibold', out ? 'text-primary-foreground/85' : 'text-foreground/80')}>{m.subject}</p>}
          <MessageText text={quoted && full.data ? cleanBody(full.data) : text} out={out} />
          {m.has_attachments && (
            <p className={cn('mt-1.5 flex items-center gap-1 text-[12px]', out ? 'text-primary-foreground/80' : 'text-muted-foreground')}>
              <Paperclip className="h-3 w-3" /> pièce jointe
            </p>
          )}
        </div>
        <div className={cn('mt-0.5 flex gap-2 px-3 text-[11px] text-muted-foreground', out ? 'justify-end' : 'justify-start')}>
          <span>{time(m.sent_at)}</span>
          <button type="button" className="hover:text-foreground" onClick={() => setQuoted((q) => !q)}>
            {quoted ? 'masquer le mail complet' : 'mail complet'}
          </button>
          <button
            type="button"
            className="hover:text-foreground"
            onClick={() =>
              navigator.clipboard
                .writeText(quoted && full.data ? cleanBody(full.data) : text)
                .then(() => toast.success('Message copié'))
                .catch(() => toast.error('Copie impossible'))
            }
          >
            copier
          </button>
        </div>
      </div>
    </div>
  );
}

export interface ConversationContext {
  dealId?: string;
  venueId?: string;
  contactId?: string;
}

/**
 * Every mail exchanged with a venue / contact / address, as a chat, with a
 * reply box that answers in the same thread.
 */
export function Conversation({
  match,
  fallbackTo = [],
  context = {},
  emptyLabel,
  className,
  readOnly = false,
  draft = null,
  composerTop,
  sendExtra,
  onSent,
}: {
  match: Match;
  fallbackTo?: string[];
  context?: ConversationContext;
  emptyLabel?: string;
  /** History only, no reply box (e.g. above a follow-up draft). */
  readOnly?: boolean;
  /** Pre-fills the reply box (e.g. Claude's follow-up). A new key loads a new version. */
  draft?: { key: string; to: string; subject: string; body: string; inReplyTo?: string | null; references?: string | null } | null;
  /** Shown just above the reply box (draft status, actions). */
  composerTop?: React.ReactNode;
  /** Extra send options (e.g. relance: true). */
  sendExtra?: { relance?: boolean };
  /** Called once the mail has left. */
  onSent?: () => void;
  className?: string;
}) {
  const emails = useEmails();
  const markSeen = useMarkSeen();
  const send = useSendMessage();
  const scroller = useRef<HTMLDivElement>(null);

  const thread = useMemo(
    () => (emails.data ?? []).filter((e) => matches(e, match)).sort((a, b) => a.sent_at.localeCompare(b.sent_at)),
    [emails.data, match],
  );
  const target = useMemo(() => replyTarget(thread, fallbackTo), [thread, fallbackTo]);

  // Threading of a pre-filled draft (it knows which mail it answers).
  const [draftThread, setDraftThread] = useState<{ inReplyTo: string | null; references: string | null } | null>(null);
  const [loadedDraft, setLoadedDraft] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [subject, setSubject] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const area = useRef<HTMLTextAreaElement>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkLabel, setLinkLabel] = useState('');
  const [linkHref, setLinkHref] = useState('');
  const sel = useRef<[number, number]>([0, 0]);
  const links = useMemo(
    () => [...body.matchAll(/\[([^\]\n]+)\]\(([^)\s]+)\)/g)].map((m) => ({ label: m[1], href: normalizeHref(m[2]) })).filter((l): l is { label: string; href: string } => !!l.href),
    [body],
  );

  const openLink = () => {
    const el = area.current;
    const start = el?.selectionStart ?? body.length;
    const end = el?.selectionEnd ?? body.length;
    sel.current = [start, end];
    setLinkLabel(body.slice(start, end).trim());
    setLinkHref('');
    setLinkOpen(true);
  };
  const applyLink = () => {
    const href = normalizeHref(linkHref);
    if (!href) return toast.error('Adresse invalide (ex. kruzberg.com/epk)');
    const label = linkLabel.trim() || prettyUrl(href);
    const [start, end] = sel.current;
    const r = insertLink(body, start, end, label, href);
    setBody(r.value);
    setLinkOpen(false);
    requestAnimationFrame(() => {
      area.current?.focus();
      area.current?.setSelectionRange(r.caret, r.caret);
    });
  };
  if (draft && draft.key !== loadedDraft) {
    setLoadedDraft(draft.key);
    setTo(draft.to || null);
    setSubject(draft.subject || null);
    setBody(draft.body);
    setDraftThread({ inReplyTo: draft.inReplyTo ?? null, references: draft.references ?? null });
  }
  const toValue = to ?? target.to.join(', ');
  const subjectValue = subject ?? target.subject;

  // Read on open.
  const unreadIds = thread.filter((e) => e.direction === 'in' && !e.seen).map((e) => e.id);
  const unreadKey = unreadIds.join(',');
  useEffect(() => {
    if (unreadIds.length) markSeen.mutate(unreadIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unreadKey]);

  // Stick to the latest message.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [thread.length]);

  const submit = () => {
    const text = body.trim();
    if (!text || send.isPending) return;
    if (!toValue.includes('@')) return toast.error('Indique une adresse email');
    if (!subjectValue.trim()) return toast.error('Indique un objet');
    send.mutate(
      {
        to: toValue,
        subject: subjectValue,
        emailBody: text,
        inReplyTo: draftThread ? draftThread.inReplyTo : subject === null ? target.inReplyTo : null,
        references: draftThread ? draftThread.references : subject === null ? target.references : null,
        ...context,
        ...sendExtra,
      },
      {
        onSuccess: () => {
          setBody('');
          setTo(null);
          setSubject(null);
          setDraftThread(null);
          toast.success('Mail envoyé');
          onSent?.();
        },
      },
    );
  };

  if (isSetupError(emails.error)) return <SetupNotice />;

  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      <div ref={scroller} className="min-h-0 flex-1 space-y-2 overflow-y-auto px-1 py-3">
        {emails.isLoading && (
          <div className="flex justify-center py-10 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        )}
        {!emails.isLoading && thread.length === 0 && (
          <p className="px-4 py-10 text-center text-[14px] text-muted-foreground">{emptyLabel ?? 'Aucun échange pour l’instant.'}</p>
        )}
        {thread.map((m, i) => {
          const prev = thread[i - 1];
          const newDay = !prev || new Date(prev.sent_at).toDateString() !== new Date(m.sent_at).toDateString();
          const showSubject = !prev || baseSubject(prev.subject) !== baseSubject(m.subject);
          return (
            <Fragment key={m.id}>
              {newDay && <p className="pb-1 pt-4 text-center text-[11.5px] font-medium text-muted-foreground first-letter:uppercase">{dayLabel(m.sent_at)}</p>}
              <Bubble m={m} showSubject={showSubject} />
            </Fragment>
          );
        })}
      </div>

      {/* Composer */}
      {!readOnly && (
      <div className="border-t px-1 pt-2.5">
        {composerTop}
        <div className="flex flex-wrap gap-x-3 gap-y-1 px-2 pb-1.5 text-[12.5px] text-muted-foreground">
          <label className="flex min-w-0 flex-1 items-center gap-1.5">
            À
            <input value={toValue} onChange={(e) => setTo(e.target.value)} placeholder="adresse@lieu.fr" className="min-w-0 flex-1 bg-transparent text-foreground outline-none focus-visible:outline-none" />
          </label>
          <label className="flex min-w-0 flex-[2] items-center gap-1.5">
            Objet
            <input
              value={subjectValue}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={thread.length ? replySubject(thread[thread.length - 1].subject) : 'Objet du mail'}
              className="min-w-0 flex-1 bg-transparent text-foreground outline-none focus-visible:outline-none"
            />
          </label>
        </div>
        {linkOpen && (
          <div className="mb-2 flex flex-wrap items-center gap-2 rounded-2xl border bg-card p-2 shadow-pop">
            <input
              autoFocus={!linkLabel}
              value={linkLabel}
              onChange={(e) => setLinkLabel(e.target.value)}
              placeholder="Texte du lien (ex. Dossier de presse)"
              className="h-8 min-w-0 flex-1 rounded-lg bg-secondary px-2.5 text-[13.5px] outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            />
            <input
              autoFocus={!!linkLabel}
              value={linkHref}
              onChange={(e) => setLinkHref(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  applyLink();
                }
                if (e.key === 'Escape') setLinkOpen(false);
              }}
              placeholder="Adresse (kruzberg.com/epk, https://…)"
              className="h-8 min-w-0 flex-[1.3] rounded-lg bg-secondary px-2.5 text-[13.5px] outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            />
            <button type="button" onClick={applyLink} className="h-8 rounded-lg bg-primary px-3 text-[13px] font-medium text-primary-foreground">
              Insérer
            </button>
            <button type="button" onClick={() => setLinkOpen(false)} className="h-8 rounded-lg px-2 text-[13px] text-muted-foreground hover:text-foreground">
              Annuler
            </button>
          </div>
        )}
        <div className="flex items-end gap-1.5 rounded-[22px] border bg-card py-1.5 pl-1.5 pr-3 focus-within:border-primary/60">
          <button
            type="button"
            onClick={openLink}
            title="Insérer un lien (⌘K)"
            className="mb-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <Link2 className="h-4 w-4" />
          </button>
          <textarea
            ref={area}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                submit();
              }
              if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                e.stopPropagation();
                openLink();
              }
            }}
            onPaste={(e) => {
              // Pasting a web address over selected text turns it into a link.
              const el = e.currentTarget;
              const pasted = e.clipboardData.getData('text').trim();
              const href = normalizeHref(pasted);
              if (el.selectionStart !== el.selectionEnd && href && !/\s/.test(pasted)) {
                e.preventDefault();
                const r = insertLink(body, el.selectionStart, el.selectionEnd, body.slice(el.selectionStart, el.selectionEnd), href);
                setBody(r.value);
                requestAnimationFrame(() => el.setSelectionRange(r.caret, r.caret));
                return;
              }
              // Rich text (a page, a mail, a document): its links are kept as [texte](adresse).
              const md = pastedHtmlToComposer(e.clipboardData.getData('text/html'));
              if (md) {
                e.preventDefault();
                const start = el.selectionStart;
                setBody(body.slice(0, start) + md + body.slice(el.selectionEnd));
                requestAnimationFrame(() => el.setSelectionRange(start + md.length, start + md.length));
              }
            }}
            rows={Math.min(14, Math.max(1, body.split('\n').length))}
            placeholder={thread.length ? 'Répondre…' : 'Écrire un mail…'}
            className="max-h-80 min-h-[28px] flex-1 resize-none bg-transparent py-1 text-[14.5px] outline-none placeholder:text-muted-foreground/70 focus-visible:outline-none"
          />
          <button
            type="button"
            onClick={submit}
            disabled={!body.trim() || send.isPending}
            title="Envoyer (⌘↩)"
            className="mb-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity disabled:opacity-30"
          >
            {send.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowUp className="h-4 w-4" strokeWidth={2.5} />}
          </button>
        </div>
        <p className="px-2 pb-1 pt-1 text-[11px] text-muted-foreground/70">
          {links.length ? (
            <>
              Lien{links.length > 1 ? 's' : ''} cliquable{links.length > 1 ? 's' : ''} :{' '}
              {links.map((l, i) => (
                <Fragment key={i}>
                  {i > 0 && ', '}
                  <span className="text-primary">{l.label}</span> → {prettyUrl(l.href)}
                </Fragment>
              ))}
              {' · '}
            </>
          ) : null}
          Envoyé depuis booking@ avec ta signature, dans le même fil · ⌘K lien · ⌘↩ envoyer
        </p>
      </div>
      )}
    </div>
  );
}
