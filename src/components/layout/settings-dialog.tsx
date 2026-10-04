'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut, Plug, RotateCcw, Trash2, User } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { createClient } from '@/lib/supabase/client';
import { formatRelativeDate } from '@/lib/utils';
import { getSettings, revokeConnection } from '@/lib/settings/actions';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { usePurgeBatch, useRestoreBatch, useTrash, type TrashRow } from '@/hooks/use-trash';

const ENTITY_LABELS: Record<string, string> = {
  venue: 'Lieu',
  contact: 'Contact',
  deal: 'Opportunité',
  task: 'Tâche',
  activity: 'Note',
  tour: 'Tournée',
  tour_stop: 'Étape de tournée',
  tour_expense: 'Dépense',
  template: 'Template',
  band: 'Groupe',
};
// The item shown for a group: the "parent" that was deleted (its dependents follow).
const ROOT_ORDER = ['venue', 'tour', 'contact', 'deal', 'band', 'template', 'tour_stop', 'task', 'tour_expense', 'activity'];

function groupTrash(rows: TrashRow[]) {
  const groups = new Map<string, TrashRow[]>();
  for (const r of rows) {
    const key = r.batch ?? r.id;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  return [...groups.entries()].map(([batch, items]) => {
    const sorted = [...items].sort((a, b) => ROOT_ORDER.indexOf(a.entity) - ROOT_ORDER.indexOf(b.entity));
    return { batch, root: sorted[0], others: sorted.length - 1, deletedAt: sorted[0].deleted_at, hasBatch: !!items[0].batch };
  });
}

function Trash({ open }: { open: boolean }) {
  const { data: rows, isLoading } = useTrash(open);
  const restore = useRestoreBatch();
  const purge = usePurgeBatch();
  const groups = groupTrash(rows ?? []);

  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium flex items-center gap-2">
        <Trash2 className="h-4 w-4" /> Corbeille
      </h3>
      <p className="text-xs text-muted-foreground">Éléments supprimés (dans le CRM ou par Claude), restaurables avec tout ce qui a été supprimé en même temps.</p>
      {isLoading ? (
        <Skeleton className="h-12" />
      ) : groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">La corbeille est vide.</p>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
          {groups.map((g) => (
            <div key={g.batch} className="flex items-center justify-between gap-2 rounded-lg border p-2.5">
              <div className="min-w-0">
                <p className="text-sm truncate">
                  <span className="text-muted-foreground">{ENTITY_LABELS[g.root.entity] ?? g.root.entity} · </span>
                  {g.root.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  supprimé {formatRelativeDate(g.deletedAt)}
                  {g.others > 0 ? ` · avec ${g.others} élément${g.others > 1 ? 's' : ''} lié${g.others > 1 ? 's' : ''}` : ''}
                </p>
              </div>
              {g.hasBatch && (
                <div className="flex gap-1 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1 h-8"
                    disabled={restore.isPending}
                    onClick={() =>
                      restore.mutate(g.batch, {
                        onSuccess: () => toast.success('Restauré'),
                        onError: (e) => toast.error(e instanceof Error ? e.message : 'Restauration impossible'),
                      })
                    }
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Restaurer
                  </Button>
                  <ConfirmDialog
                    title="Supprimer définitivement ?"
                    description={`« ${g.root.name} »${g.others ? ` et ${g.others} élément(s) lié(s)` : ''} seront effacés pour de bon. Cette action est irréversible.`}
                    confirmLabel="Supprimer définitivement"
                    onConfirm={() => purge.mutate(g.batch, { onSuccess: () => toast.success('Supprimé définitivement') })}
                  >
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive" title="Supprimer définitivement">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </ConfirmDialog>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

type Settings = Awaited<ReturnType<typeof getSettings>>;

/** "Réglages" window, opened from the KRUZBERG logo: account + Claude connections. */
export function SettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getSettings()
      .then((s) => !cancelled && setSettings(s))
      .catch(() => toast.error('Impossible de charger les réglages'));
    return () => {
      cancelled = true;
    };
  }, [open]);

  const revoke = (familyId: string) => {
    startTransition(async () => {
      await revokeConnection(familyId);
      setSettings(await getSettings());
      toast.success('Accès révoqué');
    });
  };

  const logout = async () => {
    await createClient().auth.signOut();
    router.push('/login');
    router.refresh();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Réglages</DialogTitle>
          <DialogDescription>Ton compte et les accès accordés à Claude.</DialogDescription>
        </DialogHeader>

        <section className="space-y-2">
          <h3 className="text-sm font-medium flex items-center gap-2">
            <User className="h-4 w-4" /> Mon compte
          </h3>
          {settings ? (
            <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <span className="text-sm truncate">{settings.email}</span>
              <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-destructive" onClick={logout}>
                <LogOut className="h-4 w-4" /> Déconnexion
              </Button>
            </div>
          ) : (
            <Skeleton className="h-12" />
          )}
        </section>

        <Separator />

        <section className="space-y-2">
          <h3 className="text-sm font-medium flex items-center gap-2">
            <Plug className="h-4 w-4" /> Connexions Claude
          </h3>
          <p className="text-xs text-muted-foreground">
            Accès du connecteur MCP « KRUZBERG CRM » (lecture et écriture). Chaque modification est inscrite au journal d&apos;audit.
          </p>
          {!settings ? (
            <Skeleton className="h-16" />
          ) : !settings.isOwner ? (
            <p className="text-sm text-muted-foreground">Réservé au propriétaire du CRM.</p>
          ) : settings.connections.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun accès actif.</p>
          ) : (
            <div className="space-y-2">
              {settings.connections.map((c) => (
                <div key={c.familyId} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{c.clientName}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.lastUsedAt ? `Utilisé ${formatRelativeDate(c.lastUsedAt)}` : `Jeton émis ${formatRelativeDate(c.issuedAt)}`}
                      {' · '}expire sans utilisation le {new Date(c.expiresAt).toLocaleDateString('fr-FR')}
                    </p>
                  </div>
                  <ConfirmDialog
                    title={`Couper l'accès de « ${c.clientName} » ?`}
                    description="Claude ne pourra plus lire ni modifier le CRM avec cet accès. Il faudra reconnecter le connecteur depuis Claude."
                    confirmLabel="Révoquer"
                    onConfirm={() => revoke(c.familyId)}
                  >
                    <Button variant="destructive" size="sm" disabled={pending}>
                      Révoquer
                    </Button>
                  </ConfirmDialog>
                </div>
              ))}
            </div>
          )}
        </section>

        <Separator />

        <Trash open={open} />
      </DialogContent>
    </Dialog>
  );
}
