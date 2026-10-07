'use client';

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { CalendarClock, Check, ChevronDown, Flag, Layers, Mail, Tag, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { canQuickRelance, useBulkArchiveDeals, useBulkQuickRelance, useBulkUpdateDeals } from '@/hooks/use-deals';
import { PRIORITIES, RELANCE_METHODS, STAGES, type Deal } from '@/types/database';
import { cn } from '@/lib/utils';

const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

/** Floating bar shown when opportunities are selected in the pipeline: mass updates. */
export function BulkActionsBar({ deals, onClear }: { deals: Deal[]; onClear: () => void }) {
  const update = useBulkUpdateDeals();
  const relance = useBulkQuickRelance();
  const archive = useBulkArchiveDeals();
  const [tagOpen, setTagOpen] = useState(false);
  const [tag, setTag] = useState('');
  const busy = update.isPending || relance.isPending || archive.isPending;
  const n = deals.length;
  const tagsInSelection = useMemo(() => [...new Set(deals.flatMap((d) => d.tags ?? []))].sort(), [deals]);
  const relanceable = deals.filter(canQuickRelance).length;

  const run = (patch: Parameters<typeof update.mutate>[0]['patch'], message: string) =>
    update.mutate({ deals, patch, message });

  const addTag = () => {
    const t = tag.trim();
    if (!t) return;
    run((d) => ((d.tags ?? []).includes(t) ? null : { tags: [...(d.tags ?? []), t] }), `Tag « ${t} » ajouté`);
    setTag('');
    setTagOpen(false);
  };

  const trigger = (icon: React.ReactNode, label: string) => (
    <Button size="sm" variant="ghost" className="h-8 gap-1.5 px-2.5" disabled={busy}>
      {icon}
      <span className="hidden sm:inline">{label}</span>
      <ChevronDown className="h-3 w-3 opacity-60" />
    </Button>
  );

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        transition={{ duration: 0.15 }}
        className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2 w-[calc(100%-2rem)] sm:w-auto max-w-full"
      >
        <div className="flex items-center gap-0.5 rounded-xl border bg-popover p-1.5 shadow-2xl flex-wrap justify-center">
          <span className="px-2 text-sm font-medium whitespace-nowrap">
            {n} sélectionnée{n > 1 ? 's' : ''}
          </span>
          <div className="mx-1 h-5 w-px bg-border" />

          {/* Contacté / relancé: logs the action in the history like the card button. */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>{trigger(<Check className="h-3.5 w-3.5" />, 'Contacté via')}</DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground max-w-64">
                Note un contact / une relance dans l&apos;historique, avance l&apos;étape et prévoit une relance dans 7 j
                {relanceable < n && ` (${n - relanceable} ignorée${n - relanceable > 1 ? 's' : ''} : confirmé / terminé / refusé)`}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {RELANCE_METHODS.map((m) => (
                <DropdownMenuItem
                  key={m.key}
                  disabled={relanceable === 0}
                  onClick={() => relance.mutate({ deals, channel: m.key }, { onSuccess: onClear })}
                >
                  {m.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>{trigger(<Layers className="h-3.5 w-3.5" />, 'Étape')}</DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel className="text-xs">Déplacer vers…</DropdownMenuLabel>
              {STAGES.map((s) => (
                <DropdownMenuItem key={s.key} onClick={() => run({ stage: s.key }, `Déplacé vers « ${s.label} »`)}>
                  <span className={cn('inline-flex rounded-md px-2 py-0.5 text-xs font-medium', s.color)}>{s.label}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>{trigger(<Mail className="h-3.5 w-3.5" />, 'Dernier contact')}</DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel className="text-xs">Dernier contact via…</DropdownMenuLabel>
              {RELANCE_METHODS.map((m) => (
                <DropdownMenuItem key={m.key} onClick={() => run({ last_relance_method: m.key }, `Dernier contact via ${m.label}`)}>
                  {m.label}
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem onClick={() => run({ last_relance_method: null }, 'Canal effacé')}>
                <span className="text-muted-foreground">Aucun (effacer)</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  const now = new Date().toISOString();
                  run((d) => ({ last_message_at: now, ...(d.first_contact_at ? {} : { first_contact_at: now }) }), "Dernier contact : aujourd'hui");
                }}
              >
                Date du dernier contact : aujourd&apos;hui
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>{trigger(<CalendarClock className="h-3.5 w-3.5" />, 'Relance')}</DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel className="text-xs">Prochaine relance</DropdownMenuLabel>
              {[3, 7, 14, 30].map((days) => (
                <DropdownMenuItem key={days} onClick={() => run({ next_relance_at: inDays(days) }, `Relance dans ${days} j`)}>
                  Dans {days} jours
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => run({ next_relance_at: null }, 'Relance retirée')}>
                <span className="text-muted-foreground">Pas de relance</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>{trigger(<Flag className="h-3.5 w-3.5" />, 'Priorité')}</DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {PRIORITIES.map((p) => (
                <DropdownMenuItem key={p.key} onClick={() => run({ priority: p.key }, `Priorité ${p.label.toLowerCase()}`)}>
                  {p.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>{trigger(<Tag className="h-3.5 w-3.5" />, 'Tags')}</DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={() => setTagOpen(true)}>Ajouter un tag…</DropdownMenuItem>
              {tagsInSelection.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs">Retirer</DropdownMenuLabel>
                  {tagsInSelection.map((t) => (
                    <DropdownMenuItem
                      key={t}
                      onClick={() =>
                        run((d) => ((d.tags ?? []).includes(t) ? { tags: d.tags.filter((x) => x !== t) } : null), `Tag « ${t} » retiré`)
                      }
                    >
                      <X className="h-3 w-3" /> {t}
                    </DropdownMenuItem>
                  ))}
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <ConfirmDialog
            title={`Supprimer ${n} opportunité${n > 1 ? 's' : ''} ?`}
            description="Elles restent récupérables dans Réglages → Corbeille (et via « Annuler » juste après)."
            confirmLabel="Supprimer"
            onConfirm={() => archive.mutate(deals.map((d) => d.id), { onSuccess: onClear })}
          >
            <Button size="sm" variant="ghost" className="h-8 px-2.5 text-red-500 hover:text-red-500" disabled={busy} title="Supprimer">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </ConfirmDialog>

          <div className="mx-1 h-5 w-px bg-border" />
          <Button size="sm" variant="ghost" className="h-8 px-2.5" onClick={onClear} title="Tout désélectionner (Échap)">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </motion.div>

      <Dialog open={tagOpen} onOpenChange={setTagOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Ajouter un tag</DialogTitle>
            <DialogDescription>
              Sur les {n} opportunité{n > 1 ? 's' : ''} sélectionnée{n > 1 ? 's' : ''}.
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              addTag();
            }}
          >
            <Input autoFocus value={tag} onChange={(e) => setTag(e.target.value)} placeholder="ex. tournée-printemps" />
            <Button type="submit" disabled={!tag.trim()}>
              Ajouter
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
