'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useRadarWrite } from '@/hooks/use-radar';
import { CATS, fmtDate, inCrm, norm, normCity, today, type RadarIndex } from '@/lib/radar/logic';
import type { Lead, RadarCat, RadarLearned, RadarRun, RadarScope } from '@/lib/radar/types';

/** Search settings (read by every search, 3 times a day), what it learned, manual lead, search log. */
export function VeilleDialog({
  open,
  onOpenChange,
  scope,
  learned,
  runs,
  leads,
  idx,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  scope: RadarScope;
  learned: RadarLearned;
  runs: RadarRun[];
  leads: Lead[];
  idx: RadarIndex;
}) {
  const write = useRadarWrite();
  const [draft, setDraft] = useState<RadarScope>(scope);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setDraft(scope);
  }
  const cats = draft.cats || {};
  const setCat = (id: RadarCat, patch: { on?: boolean; max?: number }) =>
    setDraft({ ...draft, cats: { ...cats, [id]: { on: cats[id]?.on !== false, max: cats[id]?.max ?? 5, ...patch } } });

  const save = async () => {
    const full: Record<string, { on: boolean; max: number }> = {};
    for (const c of CATS) full[c.id] = { on: cats[c.id]?.on !== false, max: Math.max(0, Math.min(20, cats[c.id]?.max ?? 5)) };
    await write.mutateAsync({ op: 'set', collection: 'config', id: 'scope', data: { focus: draft.focus || '', exclude: draft.exclude || '', next: draft.next || '', cats: full, updatedAt: today() } });
    toast.success('Réglages enregistrés · appliqués à la prochaine veille');
  };

  // Manual lead
  const [cat, setCatSel] = useState<RadarCat>('booking_fr');
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [email, setEmail] = useState('');
  const [url, setUrl] = useState('');
  const [force, setForce] = useState('');
  const addLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const key = norm(name) + '|' + normCity(city);
    const ex = (idx.dup.get(key) || [])[0] || leads.find((l) => norm(l.name) === norm(name));
    if (ex && force !== key) {
      setForce(key);
      toast.warning(`Existe déjà : ${ex.name}${inCrm(ex) ? ' (dans le pipeline)' : ex.dismissed ? ' (écartée)' : ''}. Clique encore sur Ajouter pour forcer.`);
      return;
    }
    await write.mutateAsync({
      op: 'add',
      collection: 'leads',
      data: {
        cat,
        name: name.trim(),
        city: city.trim() || null,
        country: 'FR',
        email: email.trim() || null,
        links: /^https?:\/\//.test(url.trim()) ? [{ label: 'Lien', url: url.trim() }] : [],
        fit: 2,
        status: 'à contacter',
        dismissed: false,
        addedAt: today(),
        source: 'manuel',
      },
    });
    setName('');
    setCity('');
    setEmail('');
    setUrl('');
    setForce('');
    toast.success('Piste ajoutée');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Veille</DialogTitle>
          <DialogDescription>
            Recherche automatique 3 fois par jour (7 h · 13 h · 19 h), qui apprend de tes choix{scope.updatedAt ? ` · réglages modifiés le ${fmtDate(scope.updatedAt)}` : ''}.
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="scope">
          <TabsList>
            <TabsTrigger value="scope">Réglages</TabsTrigger>
            <TabsTrigger value="learned">Ce qu’elle a appris</TabsTrigger>
            <TabsTrigger value="add">Ajouter une piste</TabsTrigger>
            <TabsTrigger value="log">Journal ({runs.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="scope" className="space-y-4 mt-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Priorités / élargir le scope</Label>
                <Textarea value={draft.focus || ''} onChange={(e) => setDraft({ ...draft, focus: e.target.value })} placeholder="Ex : plus de bars-concerts à Grenoble et Saint-Étienne…" className="min-h-[90px]" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">À exclure</Label>
                <Textarea value={draft.exclude || ''} onChange={(e) => setDraft({ ...draft, exclude: e.target.value })} placeholder="Ex : lieux > 500 places ; tremplins payants…" className="min-h-[90px]" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Consigne pour la prochaine recherche (effacée une fois traitée)</Label>
              <Textarea value={draft.next || ''} onChange={(e) => setDraft({ ...draft, next: e.target.value })} placeholder="Ex : trouve les dates de tournée européenne de Gurriers au printemps 2027." />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Rubriques suivies · nouvelles pistes max par recherche</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {CATS.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                    <input type="checkbox" className="accent-[hsl(var(--primary))]" checked={cats[c.id]?.on !== false} onChange={(e) => setCat(c.id, { on: e.target.checked })} />
                    <span className="flex-1">{c.label}</span>
                    <Input type="number" min={0} max={20} value={cats[c.id]?.max ?? 5} onChange={(e) => setCat(c.id, { max: Number(e.target.value) })} className="h-7 w-16 text-xs" />
                  </label>
                ))}
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={save} disabled={write.isPending}>
                Enregistrer les réglages
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="learned" className="mt-4 space-y-4 text-sm">
            {!learned.updatedAt ? (
              <p className="text-muted-foreground">
                Rien encore : à chaque recherche, la veille relit ce que deviennent les pistes (réponses, refus, pistes écartées et pourquoi, ton avis « plus / moins réaliste ») et note ici ce qu’elle en retient.
              </p>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">Mis à jour le {fmtDate(learned.updatedAt)}. Pour la corriger, écris une consigne dans « Priorités » ou « À exclure ».</p>
                {learned.summary && <p>{learned.summary}</p>}
                {(
                  [
                    ['Ce qui marche (elle en cherche plus)', learned.works],
                    ['Ce qu’elle évite', learned.avoid],
                    ['Pistes de recherche des prochains jours', learned.angles],
                  ] as const
                ).map(([title, items]) =>
                  items?.length ? (
                    <div key={title} className="space-y-1">
                      <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</h4>
                      <ul className="list-disc space-y-0.5 pl-5">
                        {items.map((x) => (
                          <li key={x}>{x}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null,
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="add" className="mt-4">
            <form onSubmit={addLead} className="grid gap-3 sm:grid-cols-2">
              <Select value={cat} onValueChange={(v) => setCatSel(v as RadarCat)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATS.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom *" required />
              <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Ville" />
              <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Lien (https://…)" className="sm:col-span-2" />
              <div className="sm:col-span-2 flex justify-end">
                <Button type="submit" disabled={!name.trim() || write.isPending}>
                  Ajouter
                </Button>
              </div>
            </form>
          </TabsContent>

          <TabsContent value="log" className="mt-4">
            {runs.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune veille enregistrée.</p>
            ) : (
              <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                {runs.map((r, i) => (
                  <div key={`${r.date}-${r.slot ?? ''}-${i}`} className="rounded-lg border p-2.5 text-sm">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {fmtDate(r.date)}
                        {r.slot ? ` · ${r.slot}` : ''}
                      </span>
                      <span>+{r.added ?? 0} piste{(r.added ?? 0) > 1 ? 's' : ''}</span>
                    </div>
                    {r.summary && <p className="mt-1 text-muted-foreground">{r.summary}</p>}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
