import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { oauthConfig, originOf } from '@/lib/oauth/config';
import { issueCode, OAuthError, redirectWith, validateAuthorize, type AuthorizeParams } from '@/lib/oauth/server';

// Consent form target (POST from /oauth/authorize). Requires the CRM session of
// the owner; same-origin only (the session cookie is SameSite=Lax anyway).

const text = (message: string, status: number) =>
  new Response(message, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } });

export async function POST(request: Request) {
  const origin = originOf(request);
  if (request.headers.get('origin') !== origin) return text('Requête refusée (origine inconnue).', 403);
  const config = oauthConfig();
  if (!config) return text('OAuth non configuré sur le serveur.', 503);

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return text('Session expirée : reconnecte-toi au CRM puis relance la connexion depuis Claude.', 401);
  if (user.id !== config.ownerId) return text("Ce compte n'est pas autorisé à connecter Claude au CRM.", 403);

  const form = await request.formData();
  const p = Object.fromEntries(
    ['response_type', 'client_id', 'redirect_uri', 'code_challenge', 'code_challenge_method', 'state', 'scope', 'resource'].map((k) => [
      k,
      (form.get(k) as string | null) ?? undefined,
    ]),
  ) as AuthorizeParams;

  try {
    const { redirectError } = await validateAuthorize(config.store, p, origin);
    const back = (params: Record<string, string | undefined>) =>
      NextResponse.redirect(redirectWith(p.redirect_uri!, { ...params, state: p.state, iss: origin }), 303);
    if (redirectError) return back({ error: redirectError.code, error_description: redirectError.description });
    if (form.get('decision') !== 'approve') return back({ error: 'access_denied', error_description: 'Accès refusé.' });
    const code = await issueCode(config.store, { ...p, client_id: p.client_id!, redirect_uri: p.redirect_uri!, code_challenge: p.code_challenge! }, user.id);
    return back({ code });
  } catch (err) {
    if (err instanceof OAuthError) return text(err.description, 400);
    console.error('[oauth] authorize failed', err);
    return text('Erreur interne.', 500);
  }
}
