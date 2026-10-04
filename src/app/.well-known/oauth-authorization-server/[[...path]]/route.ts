import { CORS, corsPreflight, originOf } from '@/lib/oauth/config';
import { authorizationServerMetadata } from '@/lib/oauth/server';

// RFC 8414 — authorization server metadata (issuer = origin of the CRM).
export function GET(request: Request) {
  return Response.json(authorizationServerMetadata(originOf(request)), {
    headers: { ...CORS, 'cache-control': 'public, max-age=3600' },
  });
}

export const OPTIONS = corsPreflight;
