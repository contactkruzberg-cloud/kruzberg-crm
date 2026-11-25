'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import { ArrowUp, ExternalLink, Loader2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

// "Demander à Claude": a free request sent to one of Greg's Claude routines
// (Radar, Constellation). Answers take a few minutes: the thread shows each
// question, where it stands, then the answer with its sources.

export interface AskItem {
  id: string;
  question: string;
  status: 'queued' | 'running' | 'done' | 'error';
  requestedAt: string;
  answer?: string;
  error?: string;
  sources?: { title: string; url: string }[];
  /** "12 pistes ajoutées", chips of bands… */
  extra?: React.ReactNode;
  /** claude.ai link to follow the run live. */
  sessionUrl?: string;
}

const time = (iso: string) => {
  const d = new Date(iso);
  const same = d.toDateString() === new Date().toDateString();
  return same ? d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

/** **gras**, listes « - », liens nus : assez pour lire une réponse. */
function Rich({ text }: { text: string }) {
  const inline = (s: string) =>
    s.split(/(\*\*[^*]+\*\*|https?:\/\/[^\s)]+)/g).map((part, i) =>
      part.startsWith('**') && part.endsWith('**') ? (
        <strong key={i}>{part.slice(2, -2)}</strong>
      ) : /^https?:\/\//.test(part) ? (
        <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-primary underline-offset-2 hover:underline">
          {part.replace(/^https?:\/\/(www\.)?/, '').slice(0, 40)}
        </a>
      ) : (
        <Fragment key={i}>{part}</Fragment>
      ),
    );
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length)
      blocks.push(
        <ul key={`l${blocks.length}`} className="my-1 list-disc space-y-0.5 pl-5">
          {list.map((l, i) => (
            <li key={i}>{inline(l)}</li>
          ))}
        </ul>,
      );
    list = [];
  };
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*[-•*]\s+(.*)/);
    if (m) list.push(m[1]);
    else {
      flush();
      if (line.trim()) {
        const h = line.match(/^#{1,4}\s+(.*)/);
        blocks.push(h ? <p key={`p${blocks.length}`} className="mt-2 font-semibold">{inline(h[1])}</p> : <p key={`p${blocks.length}`} className="my-1">{inline(line)}</p>);
      }
    }
  }
  flush();
  return <div className="text-[14px] leading-relaxed">{blocks}</div>;
}

export function AskClaude({
  items,
  onAsk,
  sending,
  suggestions,
  placeholder,
  intro,
  busyNote,
  className,
}: {
  items: AskItem[];
  onAsk: (question: string) => Promise<unknown> | void;
  sending?: boolean;
  suggestions: string[];
  placeholder: string;
  intro: React.ReactNode;
  /** Shown under a question in progress ("Réponse dans 5 à 15 min"). */
  busyNote: string;
  className?: string;
}) {
  const [q, setQ] = useState('');
  const box = useRef<HTMLTextAreaElement>(null);
  const ordered = [...items].sort((a, b) => a.requestedAt.localeCompare(b.requestedAt));
  const end = useRef<HTMLDivElement>(null);
  const last = ordered.at(-1);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest' });
  }, [last?.id, last?.status]);

  const send = async () => {
    const text = q.trim();
    if (!text || sending) return;
    try {
      await onAsk(text);
      setQ('');
    } catch {
      /* the caller shows the error */
    }
  };

  return (
    <div className={cn('flex flex-col', className)}>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pb-4">
        {ordered.length === 0 ? (
          <div className="max-w-xl py-4">
            <p className="flex items-center gap-2 text-[15px] font-semibold">
              <Sparkles className="h-4 w-4 text-primary" /> Demander à Claude
            </p>
            <div className="mt-1 text-[13.5px] text-muted-foreground">{intro}</div>
          </div>
        ) : (
          ordered.map((it) => (
            <div key={it.id} className="space-y-2">
              <div className="flex justify-end">
                <div className="bubble-out max-w-[85%] whitespace-pre-wrap rounded-[18px] rounded-br-md bg-primary px-3.5 py-2 text-[14px] text-primary-foreground">{it.question}</div>
              </div>
              <p className="text-right text-[11.5px] text-muted-foreground">{time(it.requestedAt)}</p>
              <div className="max-w-[92%] rounded-[18px] rounded-bl-md bg-secondary px-4 py-3">
                {it.status === 'done' && it.answer ? (
                  <>
                    <Rich text={it.answer} />
                    {it.extra && <div className="mt-2.5">{it.extra}</div>}
                    {!!it.sources?.length && (
                      <details className="mt-2.5 text-[12.5px] text-muted-foreground">
                        <summary className="cursor-pointer select-none">{it.sources.length} source{it.sources.length > 1 ? 's' : ''}</summary>
                        <ul className="mt-1 space-y-0.5">
                          {it.sources.map((s) => (
                            <li key={s.url}>
                              <a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">
                                <ExternalLink className="h-3 w-3 shrink-0" /> <span className="truncate">{s.title || s.url}</span>
                              </a>
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </>
                ) : it.status === 'done' ? (
                  <div className="text-[14px]">
                    Recherche terminée.
                    {it.extra && <div className="mt-2">{it.extra}</div>}
                  </div>
                ) : it.status === 'error' ? (
                  <p className="text-[14px] text-destructive">Claude n’a pas pu répondre{it.error ? ` : ${it.error}` : '.'} Repose la question pour réessayer.</p>
                ) : (
                  <p className="flex items-center gap-2 text-[14px] text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {it.status === 'queued' ? 'En attente de Claude…' : 'Claude cherche…'}
                    <span className="text-[12.5px]">{busyNote}</span>
                    {it.sessionUrl && (
                      <a href={it.sessionUrl} target="_blank" rel="noopener noreferrer" className="text-[12.5px] text-primary hover:underline">
                        Suivre
                      </a>
                    )}
                  </p>
                )}
              </div>
            </div>
          ))
        )}
        <div ref={end} />
      </div>

      {ordered.length === 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setQ(s);
                box.current?.focus();
              }}
              className="rounded-full border px-3 py-1 text-[12.5px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              {s}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2 rounded-[20px] border bg-card px-3 py-2 shadow-card focus-within:ring-2 focus-within:ring-primary/30">
        <textarea
          ref={box}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          rows={Math.min(5, Math.max(1, q.split('\n').length))}
          placeholder={placeholder}
          className="max-h-40 min-h-[24px] flex-1 resize-none bg-transparent py-1 text-[14.5px] outline-none placeholder:text-muted-foreground"
        />
        <button
          type="button"
          onClick={() => void send()}
          disabled={!q.trim() || sending}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity disabled:opacity-30"
          aria-label="Envoyer à Claude"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" strokeWidth={2.5} />}
        </button>
      </div>
    </div>
  );
}
