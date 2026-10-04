'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { addrUsers, CATL, dupsOf, fmtDate, isNew, keyDate, okUrl, REASONS, triQueue, zone, type RadarIndex } from '@/lib/radar/logic';
import { emailsOf } from '@/lib/radar/mail-templates';
import type { Lead, RadarMeta } from '@/lib/radar/types';
import { ChanceBadge, Kbd, Tag } from './radar-ui';
import { useRadarActions } from './use-radar-actions';

/** Sort new leads one at a time: keep, keep + write, straight to the pipeline, later, or dismiss with a reason. */
export function TriageDialog({
  open,
  onOpenChange,
  leads,
  meta,
  idx,
  onCompose,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  leads: Lead[];
  meta: RadarMeta;
  idx: RadarIndex;
  onCompose: (id: string) => void;
}) {
  const actions = useRadarActions();
  const [skip, setSkip] = useState<Set<string>>(new Set());
  const [done, setDone] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setSkip(new Set());
      setDone(0);
    }
  }
  const queue = triQueue(leads, meta, skip);
  const l = queue[0];

  const next = (counted = true) => {
    if (!l) return;
    setSkip((s) => new Set(s).add(l.id));
    if (counted) setDone((d) => d + 1);
  };
  const act = (a: 'keep' | 'mail' | 'crm' | 'skip' | 'dismiss', reason?: string) => {
    if (!l) return;
    if (a === 'skip') return next(false);
    next();
    if (a === 'keep') void actions.patch(l.id, { status: 'à contacter', statusAt: new Date().toISOString().slice(0, 10) });
    if (a === 'dismiss') void actions.dismiss(l, reason || 'Non précisé');
    if (a === 'crm') void actions.sendToPipeline(l);
    if (a === 'mail') {
      void actions.patch(l.id, { status: 'à contacter', statusAt: new Date().toISOString().slice(0, 10) });
      onOpenChange(false);
      onCompose(l.id);
    }
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || (e.target as HTMLElement)?.tagName === 'INPUT') return;
      const map: Record<string, 'keep' | 'mail' | 'crm' | 'skip'> = { g: 'keep', e: 'mail', p: 'crm', ArrowRight: 'skip', s: 'skip' };
      if (map[e.key]) {
        e.preventDefault();
        act(map[e.key]);
      } else if (/^[1-9]$/.test(e.key) && REASONS[+e.key - 1]) {
        e.preventDefault();
        act('dismiss', REASONS[+e.key - 1]);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  const k = l ? keyDate(l) : null;
  const dups = l ? dupsOf(idx, l) : [];
  const used = l ? addrUsers(idx, emailsOf(l.email), l.id) : [];
  const reach = l
    ? emailsOf(l.email).length
      ? `✉ ${l.email}`
      : l.contactForm && okUrl(l.contactForm.url)
        ? `Formulaire : ${l.contactForm.label || 'oui'}`
        : l.instagram
          ? 'Instagram seulement'
          : l.contactRoute || 'pas de contact direct'
    : '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        {!l ? (
          <div className="space-y-3 text-center py-6">
            <DialogTitle className="text-2xl">C&apos;est trié.</DialogTitle>
            <DialogDescription>
              {done} piste{done > 1 ? 's' : ''} traitée{done > 1 ? 's' : ''}. Les pistes gardées sont « à contacter » : direction l&apos;onglet « À faire ».
            </DialogDescription>
            <Button onClick={() => onOpenChange(false)}>Fermer</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {CATL[l.cat] || l.cat} · {zone(l)}
                {isNew(l, meta) ? ' · nouveau' : ''}
              </span>
              <span>
                {queue.length} à trier · {done} fait{done > 1 ? 's' : ''}
              </span>
            </div>
            <div>
              <DialogTitle className="text-2xl font-bold leading-tight">{l.name}</DialogTitle>
              <DialogDescription>
                {[l.type, l.venue, l.city, l.country && l.country !== 'FR' ? l.country : null, l.capacity ? `${l.capacity} pl.` : null].filter(Boolean).join(' · ')}
              </DialogDescription>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <ChanceBadge lead={l} />
              {k && (
                <Tag tone={k.n < 0 ? 'muted' : k.n <= 14 ? 'urgent' : 'warn'}>
                  {k.kind} {fmtDate(k.d)}
                  {k.n >= 0 ? ` · J-${k.n}` : ''}
                </Tag>
              )}
              {dups.length > 0 && <Tag tone="warn">doublon ? {dups[0].name}</Tag>}
              {used.length > 0 && <Tag tone="warn">adresse déjà sollicitée : {used[0].name}</Tag>}
            </div>
            {l.why && <p className="text-sm">{l.why}</p>}
            {l.support && <p className="text-sm text-muted-foreground">1re partie : {l.support}</p>}
            <p className="text-sm text-muted-foreground">Contact : {reach}</p>
            {(l.links || []).length > 0 && (
              <div className="flex flex-wrap gap-3 text-sm">
                {(l.links || [])
                  .filter((x) => /^https?:\/\//.test(x.url))
                  .slice(0, 4)
                  .map((x) => (
                    <a key={x.url} href={x.url} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                      {x.label || 'Lien'} ↗
                    </a>
                  ))}
              </div>
            )}
            <div className="flex flex-wrap gap-2 border-t pt-4">
              <Button onClick={() => act('keep')}>
                Garder <Kbd>g</Kbd>
              </Button>
              {(emailsOf(l.email).length > 0 || l.contactForm) && (
                <Button variant="outline" onClick={() => act('mail')}>
                  Garder + rédiger <Kbd>e</Kbd>
                </Button>
              )}
              <Button variant="outline" onClick={() => act('crm')}>
                Direct au pipeline <Kbd>p</Kbd>
              </Button>
              <Button variant="ghost" onClick={() => act('skip')}>
                Plus tard <Kbd>→</Kbd>
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Écarter :</span>
              {REASONS.map((r, i) => (
                <Button key={r} size="sm" variant="outline" className="h-7 text-xs text-destructive hover:text-destructive" onClick={() => act('dismiss', r)}>
                  {r} <Kbd>{i + 1}</Kbd>
                </Button>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
