import { CORS, corsPreflight, notConfigured, oauthConfig, originOf, readForm } from '@/lib/oauth/config';
import { OAuthError, tokenRequest } from '@/lib/oauth/server';

// Token endpoint: authorization_code (+ PKCE) and refresh_token grants.
export async function POST(request: Request) {
  const config = oauthConfig();
  if (!config) return notConfigured();
  try {
    const form = await readForm(request);
    const tokens = await tokenRequest(config.store, form, request.headers.get('authorization'), originOf(request), config.ownerId);
    return Response.json(tokens, { headers: { ...CORS, 'cache-control': 'no-store', pragma: 'no-cache' } });
  } catch (err) {
    if (err instanceof OAuthError) return err.toResponse(CORS);
    console.error('[oauth] token failed', err);
    return new OAuthError('server_error', 'Erreur interne.', 500).toResponse(CORS);
  }
}

export const OPTIONS = corsPreflight;
