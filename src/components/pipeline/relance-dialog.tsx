'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Check, Copy, Loader2, Mail, RefreshCw, Sparkles } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useQuickRelance } from '@/hooks/use-deals';
import { useMarkRelanceSent, useRelanceDocs, useRequestRelance } from '@/hooks/use-relance';
import { dealLabel, formatDate } from '@/lib/utils';
import type { RelanceDoc } from '@/lib/relance/prompt';
import type { Deal } from '@/types/database';

const mailto = (d: { to: string; subject: string; body: string }) =>
  `mailto:${d.to.split(/[,;\s]+/).filter(Boolean).join(',')}?subject=${encodeURIComponent(d.subject)}&body=${encodeURIComponent(d.body)}`;

/** A ready draft written after the last contact (an older one is stale). */
export function freshDraft(doc: RelanceDoc | undefined, deal: Deal) {
  return !!doc && doc.state === 'ready' && (!deal.last_message_at || (doc.requestedAt || '') > deal.last_message_at);
}

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
 * "Relancer": Claude (a routine on Greg's subscription) writes a personalised
 * follow-up from the deal's history and the email sent from booking@; then it
 * opens in Mail.
 */
export function RelanceDialog({ deal, open, onOpenChange }: { deal: Deal; open: boolean; onOpenChange: (o: boolean) => void }) {
  const docs = useRelanceDocs();
  const doc = docs.data?.get(deal.id);
  const asked = useRef(false);
  const request = useRequestRelance();
  const markSent = useMarkRelanceSent();
  const relance = useQuickRelance();
  const [edit, setEdit] = useState<{ to: string; subject: string; body: string } | null>(null);
  const [note, setNote] = useState('');
  const [opened, setOpened] = useState(false);

  const ready = freshDraft(doc, deal);
  const writing = doc?.state === 'requested';

  // On opening: ask for a draft unless one is ready or being written.
  useEffect(() => {
    if (!open) {
      asked.current = false;
      setOpened(false);
      setNote('');
      return;
    }
    if (asked.current || !docs.isSuccess) return;
    asked.current = true;
    if (!ready && !writing) request.mutate({ dealId: deal.id }, { onError: (e) => toast.error(e.message) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, docs.isSuccess]);

  // Editable copy of the draft, reset when a new version arrives.
  const draftKey = ready ? `${doc!.readyAt}` : '';
  useEffect(() => {
    if (ready && doc) setEdit({ to: doc.to || '', subject: doc.subject || '', body: doc.body || '' });
    else setEdit(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);

  const again = () =>
    request.mutate(
      { dealId: deal.id, note },
      { onSuccess: () => setNote(''), onError: (e) => toast.error(e.message) },
    );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> Relancer · {dealLabel(deal, '')}
          </DialogTitle>
          <DialogDescription>
            {doc?.basedOn
              ? doc.basedOn.lastSent
                ? `À partir de ton mail « ${doc.basedOn.lastSent.subject} » du ${formatDate(doc.basedOn.lastSent.date)}${doc.basedOn.relances ? ` · relance n° ${doc.basedOn.relances + 1}` : ''}.`
                : 'Aucun mail envoyé retrouvé dans booking@ pour ce contact : à partir de la fiche et de l’historique.'
              : 'Relance personnalisée rédigée par Claude.'}
          </DialogDescription>
        </DialogHeader>

        {(writing || request.isPending) && (
          <div className="space-y-2 py-10 text-center text-sm">
            <p className="flex items-center justify-center gap-2 font-medium">
              <Loader2 className="h-4 w-4 animate-spin text-primary" /> Claude rédige la relance…
              {doc?.requestedAt && writing && (
                <span className="font-normal text-muted-foreground">
                  (<Elapsed since={doc.requestedAt} />)
                </span>
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              En général 2 à 4 minutes. Tu peux fermer cette fenêtre : le bouton deviendra « Relance prête ».
            </p>
          </div>
        )}

        {doc?.state === 'error' && !writing && !request.isPending && (
          <div className="space-y-2 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm">
            <p>Claude n’a pas pu rédiger cette relance{doc.error ? ` : ${doc.error}` : '.'}</p>
            <Button size="sm" variant="outline" onClick={again}>
              Réessayer
            </Button>
          </div>
        )}

        {ready && edit && !writing && !request.isPending && (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">À</Label>
              <Input value={edit.to} onChange={(e) => setEdit({ ...edit, to: e.target.value })} placeholder="adresse@exemple.com" />
              {!edit.to && <p className="text-xs text-orange-500">Aucune adresse email sur la fiche : ajoute-la ici (ou dans Mail).</p>}
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Objet</Label>
              <Input value={edit.subject} onChange={(e) => setEdit({ ...edit, subject: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Message (modifiable)</Label>
              <Textarea value={edit.body} onChange={(e) => setEdit({ ...edit, body: e.target.value })} className="min-h-[260px] text-sm leading-relaxed" />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button asChild className="gap-1.5">
                <a href={mailto(edit)} onClick={() => setOpened(true)}>
                  <Mail className="h-4 w-4" /> Ouvrir dans Mail
                </a>
              </Button>
              <Button
                variant="outline"
                className="gap-1.5"
                onClick={() =>
                  navigator.clipboard
                    .writeText(`${edit.subject}\n\n${edit.body}`)
                    .then(() => toast.success('Objet et message copiés'))
                    .catch(() => toast.error('Copie impossible'))
                }
              >
                <Copy className="h-4 w-4" /> Copier
              </Button>
            </div>

            {opened && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
                <span>Envoyée depuis Mail ?</span>
                <Button
                  size="sm"
                  className="h-7 gap-1"
                  disabled={relance.isPending}
                  onClick={() =>
                    relance.mutate(
                      { deal, channel: 'email' },
                      {
                        onSuccess: () => {
                          markSent.mutate(deal.id);
                          onOpenChange(false);
                        },
                      },
                    )
                  }
                >
                  <Check className="h-3.5 w-3.5" /> Oui, noter la relance
                </Button>
                <span className="text-xs text-muted-foreground">(historique, étape « Relancé », prochaine relance dans 7 j)</span>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 border-t pt-3">
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && again()}
                placeholder="Consigne pour une autre version (ex. plus court, en anglais, proposer mars)…"
                className="h-8 flex-1 text-xs"
              />
              <Button size="sm" variant="ghost" className="gap-1.5" onClick={again}>
                <RefreshCw className="h-3.5 w-3.5" /> Autre version
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
