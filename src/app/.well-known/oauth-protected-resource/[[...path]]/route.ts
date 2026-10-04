import { CORS, corsPreflight, originOf } from '@/lib/oauth/config';
import { protectedResourceMetadata } from '@/lib/oauth/server';

// RFC 9728 — served at /.well-known/oauth-protected-resource and
// /.well-known/oauth-protected-resource/api/mcp (path-suffixed form).
export function GET(request: Request) {
  return Response.json(protectedResourceMetadata(originOf(request)), {
    headers: { ...CORS, 'cache-control': 'public, max-age=3600' },
  });
}

export const OPTIONS = corsPreflight;
