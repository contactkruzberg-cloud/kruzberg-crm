'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { CalendarPlus, Copy, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

/** Subscription link of the iCal feed, to add the CRM's dates to any agenda. */
export function SubscribeButton() {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setOpen(true);
    if (url) return;
    setLoading(true);
    try {
      const res = await fetch('/api/calendar/link');
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || `Erreur ${res.status}`);
      setUrl(body.url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lien indisponible');
      setOpen(false);
    } finally {
      setLoading(false);
    }
  };
  const webcal = url?.replace(/^https?:/, 'webcal:');

  return (
    <>
      <Button variant="outline" size="sm" className="gap-2" onClick={load}>
        <CalendarPlus className="h-4 w-4" /> S’abonner dans mon agenda
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Ajouter le calendrier KRUZBERG à un agenda</DialogTitle>
            <DialogDescription>
              Concerts, options, tournées et candidatures, mis à jour automatiquement. Partage ce lien avec le groupe : il ne donne accès qu’au calendrier, en
              lecture seule.
            </DialogDescription>
          </DialogHeader>
          {loading || !url ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex gap-2">
                <Input readOnly value={url} onFocus={(e) => e.target.select()} className="font-mono text-xs" />
                <Button
                  variant="outline"
                  size="icon"
                  title="Copier"
                  onClick={() =>
                    navigator.clipboard
                      .writeText(url)
                      .then(() => toast.success('Lien copié'))
                      .catch(() => toast.error('Copie impossible'))
                  }
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <Button asChild className="w-full gap-2">
                <a href={webcal}>
                  <CalendarPlus className="h-4 w-4" /> Ouvrir dans Calendrier (Mac, iPhone)
                </a>
              </Button>
              <p className="text-xs text-muted-foreground">
                <b>Google Agenda</b> : Autres agendas → « + » → À partir de l’URL → colle le lien. Google rafraîchit les abonnements toutes les quelques heures.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
