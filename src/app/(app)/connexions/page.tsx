import { revalidatePath } from 'next/cache';
import { Plug } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { oauthConfig } from '@/lib/oauth/config';
import { formatRelativeDate } from '@/lib/utils';

// Active OAuth accesses granted to Claude (connecteur personnalisé), with revocation.

async function ownerStore() {
  const config = oauthConfig();
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!config || !user || user.id !== config.ownerId) return null;
  return { store: config.store, userId: user.id };
}

async function revoke(formData: FormData) {
  'use server';
  const owner = await ownerStore();
  const familyId = String(formData.get('family_id') ?? '');
  if (!owner || !familyId) return;
  const active = await owner.store.listActive(owner.userId, new Date().toISOString());
  if (active.some((t) => t.family_id === familyId)) await owner.store.revokeFamily(familyId, new Date().toISOString());
  revalidatePath('/connexions');
}

export default async function ConnexionsPage() {
  const owner = await ownerStore();
  const tokens = owner ? await owner.store.listActive(owner.userId, new Date().toISOString()) : [];

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Plug className="h-6 w-6" /> Connexions Claude
        </h1>
        <p className="text-muted-foreground text-sm">
          Accès accordés au connecteur MCP « KRUZBERG CRM » (lecture et écriture). Toute modification est inscrite au journal d&apos;audit.
        </p>
      </div>
      {!owner ? (
        <p className="text-sm text-muted-foreground">Réservé au propriétaire du CRM.</p>
      ) : tokens.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun accès actif.</p>
      ) : (
        tokens.map((t) => (
          <Card key={t.id}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-base">{t.client_name}</CardTitle>
                <CardDescription>
                  Autorisé {formatRelativeDate(t.created_at!)}
                  {t.last_used_at ? ` · utilisé ${formatRelativeDate(t.last_used_at)}` : ''}
                </CardDescription>
              </div>
              <form action={revoke}>
                <input type="hidden" name="family_id" value={t.family_id} />
                <Button type="submit" variant="destructive" size="sm">
                  Révoquer
                </Button>
              </form>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              Expire sans utilisation le {new Date(t.refresh_expires_at).toLocaleDateString('fr-FR')}.
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
