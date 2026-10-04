import { CORS, corsPreflight, notConfigured, oauthConfig, readForm } from '@/lib/oauth/config';
import { OAuthError, revokeRequest } from '@/lib/oauth/server';

// RFC 7009 — token revocation (revokes the whole refresh chain).
export async function POST(request: Request) {
  const config = oauthConfig();
  if (!config) return notConfigured();
  try {
    await revokeRequest(config.store, await readForm(request), request.headers.get('authorization'));
    return new Response(null, { status: 200, headers: CORS });
  } catch (err) {
    if (err instanceof OAuthError) return err.toResponse(CORS);
    console.error('[oauth] revoke failed', err);
    return new OAuthError('server_error', 'Erreur interne.', 500).toResponse(CORS);
  }
}

export const OPTIONS = corsPreflight;
