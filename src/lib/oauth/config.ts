import { getPublicOrigin } from 'mcp-handler';
import { createSupabaseOAuthStore, type OAuthStore } from './store';

/** Server-side OAuth configuration, from environment variables only. Null when incomplete. */
export function oauthConfig(): { store: OAuthStore; ownerId: string; extraRedirects: string[] } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const ownerId = process.env.MCP_OWNER_ID;
  if (!url || !key || !ownerId) return null;
  return {
    store: createSupabaseOAuthStore(url, key),
    ownerId,
    extraRedirects: (process.env.OAUTH_EXTRA_REDIRECT_URIS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  };
}

/** Public origin of this deployment (respects Vercel's forwarding headers). Issuer and resource derive from it. */
export const originOf = (request: Request) => getPublicOrigin(request);

export const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type, mcp-protocol-version',
  'access-control-max-age': '86400',
};

export const corsPreflight = () => new Response(null, { status: 204, headers: CORS });

export const notConfigured = () =>
  Response.json({ error: 'temporarily_unavailable', error_description: 'OAuth non configuré sur le serveur.' }, { status: 503, headers: CORS });

/** Reads an application/x-www-form-urlencoded (or JSON) body as URLSearchParams. */
export async function readForm(request: Request): Promise<URLSearchParams> {
  const type = request.headers.get('content-type') ?? '';
  if (type.includes('application/json')) {
    const json = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    return new URLSearchParams(Object.entries(json).map(([k, v]) => [k, String(v)]));
  }
  return new URLSearchParams(await request.text());
}
