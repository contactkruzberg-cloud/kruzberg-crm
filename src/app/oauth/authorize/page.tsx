import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { oauthConfig } from '@/lib/oauth/config';
import { OAuthError, redirectWith, validateAuthorize, type AuthorizeParams } from '@/lib/oauth/server';

// Consent screen of the OAuth flow started by Claude (Paramètres > Connecteurs).

export const metadata = { title: 'Autoriser Claude — KRUZBERG CRM' };

const FIELDS = ['response_type', 'client_id', 'redirect_uri', 'code_challenge', 'code_challenge_method', 'state', 'scope', 'resource'] as const;

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center gradient-hero px-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold tracking-tighter">
            <span className="text-primary">KRUZ</span>BERG
          </h1>
          <p className="text-muted-foreground text-sm">Booking CRM</p>
        </div>
        {children}
      </div>
    </div>
  );
}

function ErrorCard({ message }: { message: string }) {
  return (
    <Shell>
      <Card className="border-border/50 shadow-2xl">
        <CardHeader className="text-center">
          <CardTitle>Connexion impossible</CardTitle>
          <CardDescription>{message}</CardDescription>
        </CardHeader>
      </Card>
    </Shell>
  );
}

export default async function AuthorizePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const p = Object.fromEntries(FIELDS.map((k) => [k, typeof sp[k] === 'string' ? sp[k] : undefined])) as AuthorizeParams;

  const h = await headers();
  const origin = `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('x-forwarded-host') ?? h.get('host')}`;
  const config = oauthConfig();
  if (!config) return <ErrorCard message="OAuth n'est pas configuré sur le serveur." />;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    const query = new URLSearchParams(Object.entries(p).filter(([, v]) => v) as [string, string][]).toString();
    redirect(`/login?next=${encodeURIComponent(`/oauth/authorize?${query}`)}`);
  }
  if (user.id !== config.ownerId) return <ErrorCard message="Ce compte n'est pas autorisé à connecter Claude au CRM." />;

  let clientName: string;
  try {
    const { client, redirectError } = await validateAuthorize(config.store, p, origin);
    if (redirectError) {
      redirect(redirectWith(p.redirect_uri!, { error: redirectError.code, error_description: redirectError.description, state: p.state, iss: origin }));
    }
    clientName = client.client_name;
  } catch (err) {
    if (err instanceof OAuthError) return <ErrorCard message={err.description} />;
    throw err;
  }
  const redirectHost = new URL(p.redirect_uri!).host;

  return (
    <Shell>
      <Card className="border-border/50 shadow-2xl">
        <CardHeader className="text-center">
          <ShieldCheck className="mx-auto h-10 w-10 text-primary" />
          <CardTitle>Autoriser {clientName} ?</CardTitle>
          <CardDescription>
            Connecté en tant que {user.email}. L&apos;accès sera envoyé à <strong>{redirectHost}</strong>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="text-sm space-y-1 list-disc pl-5 text-muted-foreground">
            <li>Lire tout le CRM : structures, contacts, opportunités, tâches, historique, tournées, modèles.</li>
            <li>Créer et modifier ces données, consigner relances et notes.</li>
            <li>Archiver (toujours restaurable) — jamais de suppression définitive.</li>
            <li>Chaque modification est inscrite au journal d&apos;audit.</li>
          </ul>
          <p className="text-xs text-muted-foreground">Accès valable 30 jours sans utilisation, révocable à tout moment dans le CRM : clic sur KRUZBERG en haut à gauche → Réglages.</p>
          <form method="post" action="/api/oauth/authorize" className="flex gap-3">
            {FIELDS.map((k) => (p[k] ? <input key={k} type="hidden" name={k} value={p[k]} /> : null))}
            <Button type="submit" name="decision" value="deny" variant="outline" className="flex-1">
              Refuser
            </Button>
            <Button type="submit" name="decision" value="approve" className="flex-1">
              Autoriser
            </Button>
          </form>
        </CardContent>
      </Card>
    </Shell>
  );
}
