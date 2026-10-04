'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut, Plug, User } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { createClient } from '@/lib/supabase/client';
import { formatRelativeDate } from '@/lib/utils';
import { getSettings, revokeConnection } from '@/lib/settings/actions';

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

  const revoke = (familyId: string, name: string) => {
    if (!confirm(`Couper l'accès de « ${name} » au CRM ? Il faudra le reconnecter depuis Claude.`)) return;
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
      <DialogContent className="max-w-lg">
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
                  <Button variant="destructive" size="sm" disabled={pending} onClick={() => revoke(c.familyId, c.clientName)}>
                    Révoquer
                  </Button>
                </div>
              ))}
            </div>
          )}
        </section>
      </DialogContent>
    </Dialog>
  );
}
