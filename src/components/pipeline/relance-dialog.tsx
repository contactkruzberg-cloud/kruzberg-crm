'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Check, Copy, Loader2, Mail, RefreshCw, Sparkles } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useQuickRelance } from '@/hooks/use-deals';
import { dealLabel, formatDate } from '@/lib/utils';
import type { Deal } from '@/types/database';

interface Draft {
  to: string;
  subject: string;
  body: string;
  basedOn: { lastSent: { subject: string; date: string } | null; relances: number };
}

const mailto = (d: { to: string; subject: string; body: string }) =>
  `mailto:${d.to.split(/[,;\s]+/).filter(Boolean).join(',')}?subject=${encodeURIComponent(d.subject)}&body=${encodeURIComponent(d.body)}`;

/** "Relancer": Claude drafts a personalised follow-up from the deal's history, then it opens in Mail. */
export function RelanceDialog({ deal, open, onOpenChange }: { deal: Deal; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [opened, setOpened] = useState(false);
  const relance = useQuickRelance();

  const generate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/relance', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ dealId: deal.id }) });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || `Erreur ${res.status}`);
      setDraft(body as Draft);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rédaction impossible');
    } finally {
      setLoading(false);
    }
  };

  // Draft as soon as the dialog opens (once per opening).
  useEffect(() => {
    if (open && !draft && !loading) void generate();
    if (!open) {
      setDraft(null);
      setError(null);
      setOpened(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = (patch: Partial<Draft>) => draft && setDraft({ ...draft, ...patch });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> Relancer · {dealLabel(deal, '')}
          </DialogTitle>
          <DialogDescription>
            {loading
              ? 'Claude relit l’historique et le mail envoyé, puis rédige la relance…'
              : draft
                ? draft.basedOn.lastSent
                  ? `Rédigée à partir de ton mail « ${draft.basedOn.lastSent.subject} » du ${formatDate(draft.basedOn.lastSent.date)}${draft.basedOn.relances ? ` · relance n° ${draft.basedOn.relances + 1}` : ''}.`
                  : `Aucun mail envoyé retrouvé dans booking@ pour ce contact : rédigée à partir de la fiche et de l’historique.`
                : 'Relance personnalisée rédigée par Claude.'}
          </DialogDescription>
        </DialogHeader>

        {loading && !draft && (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Rédaction en cours (10 à 20 s)…
          </div>
        )}

        {error && (
          <div className="space-y-2 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm">
            <p>{error}</p>
            <Button size="sm" variant="outline" onClick={generate} disabled={loading}>
              Réessayer
            </Button>
          </div>
        )}

        {draft && (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">À</Label>
              <Input value={draft.to} onChange={(e) => set({ to: e.target.value })} placeholder="adresse@exemple.com" />
              {!draft.to && <p className="text-xs text-orange-500">Aucune adresse email sur la fiche : ajoute-la ici (ou dans Mail).</p>}
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Objet</Label>
              <Input value={draft.subject} onChange={(e) => set({ subject: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Message (modifiable)</Label>
              <Textarea value={draft.body} onChange={(e) => set({ body: e.target.value })} className="min-h-[260px] font-[inherit] text-sm leading-relaxed" />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button asChild className="gap-1.5">
                <a href={mailto(draft)} onClick={() => setOpened(true)}>
                  <Mail className="h-4 w-4" /> Ouvrir dans Mail
                </a>
              </Button>
              <Button
                variant="outline"
                className="gap-1.5"
                onClick={() =>
                  navigator.clipboard
                    .writeText(`${draft.subject}\n\n${draft.body}`)
                    .then(() => toast.success('Objet et message copiés'))
                    .catch(() => toast.error('Copie impossible'))
                }
              >
                <Copy className="h-4 w-4" /> Copier
              </Button>
              <Button variant="ghost" className="gap-1.5" onClick={generate} disabled={loading} title="Nouvelle version">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Autre version
              </Button>
            </div>

            {opened && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
                <span>Envoyée depuis Mail ?</span>
                <Button
                  size="sm"
                  className="h-7 gap-1"
                  disabled={relance.isPending}
                  onClick={() => relance.mutate({ deal, channel: 'email' }, { onSuccess: () => onOpenChange(false) })}
                >
                  <Check className="h-3.5 w-3.5" /> Oui, noter la relance
                </Button>
                <span className="text-xs text-muted-foreground">(historique, étape « Relancé », prochaine relance dans 7 j)</span>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
