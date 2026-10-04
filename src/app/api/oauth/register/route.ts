import { CORS, corsPreflight, notConfigured, oauthConfig } from '@/lib/oauth/config';
import { OAuthError, registerClient } from '@/lib/oauth/server';
import { createRateLimiter } from '@/lib/mcp/rate-limit';

// RFC 7591 — dynamic client registration (used by claude.ai when adding the connector).
const limiter = createRateLimiter(20, 60 * 60 * 1000);

export async function POST(request: Request) {
  const config = oauthConfig();
  if (!config) return notConfigured();
  if (limiter.take()) return new OAuthError('temporarily_unavailable', 'Trop d’enregistrements, réessaie plus tard.', 429).toResponse(CORS);
  try {
    const body = await request.json().catch(() => null);
    const client = await registerClient(config.store, body, config.extraRedirects);
    return Response.json(client, { status: 201, headers: { ...CORS, 'cache-control': 'no-store' } });
  } catch (err) {
    if (err instanceof OAuthError) return err.toResponse(CORS);
    console.error('[oauth] register failed', err);
    return new OAuthError('server_error', 'Erreur interne.', 500).toResponse(CORS);
  }
}

export const OPTIONS = corsPreflight;
