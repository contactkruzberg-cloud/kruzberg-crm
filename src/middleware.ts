import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

// Avant d'ajouter un connecteur personnalisé, claude.ai sonde les URL de
// découverte OAuth. Sans elles, le middleware les redirigeait vers /login : le
// client y voyait un serveur d'autorisation, tentait un Dynamic Client
// Registration sur /register et échouait sur du HTML. Un 404 franc lui dit que
// le connecteur ne demande pas d'OAuth (auth v1 = secret dans le chemin).
const OAUTH_DISCOVERY = /^\/(?:\.well-known\/(?:oauth-|openid-)|register$|authorize$|token$)/;

export async function middleware(request: NextRequest) {
  if (OAUTH_DISCOVERY.test(request.nextUrl.pathname)) {
    return new NextResponse('Not Found', { status: 404 });
  }
  return await updateSession(request);
}

export const config = {
  matcher: [
    '/((?!api/mcp/|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
