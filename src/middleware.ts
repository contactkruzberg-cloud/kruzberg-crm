import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

// Endpoints of the MCP connector and its OAuth 2.1 server: called by Claude's
// servers (no CRM session), they handle their own authentication.
const MCP_PUBLIC = /^\/(?:api\/mcp(?:\/|$)|api\/oauth\/|\.well-known\/oauth-(?:protected-resource|authorization-server)(?:\/|$))/;

// Other discovery URLs that do not exist here (OpenID, root-level /register…):
// a plain 404 rather than a redirect to /login, which OAuth clients would
// otherwise try to parse as an authorization server.
const OAUTH_NOT_HERE = /^\/(?:\.well-known\/(?:oauth-|openid-)|register$|authorize$|token$)/;

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (MCP_PUBLIC.test(pathname)) return NextResponse.next();
  if (OAUTH_NOT_HERE.test(pathname)) return new NextResponse('Not Found', { status: 404 });
  return await updateSession(request);
}

export const config = {
  matcher: [
    '/((?!api/mcp/|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
