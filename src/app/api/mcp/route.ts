import { createMcpHandler, withMcpAuth } from 'mcp-handler';
import { notConfigured, publicBaseUrl, storeFromEnv } from '@/lib/mcp/context';
import { registerFullCrmTools } from '@/lib/mcp/crm-tools';
import { registerRadarTools } from '@/lib/mcp/tools';
import { oauthConfig } from '@/lib/oauth/config';
import { SCOPE, verifyAccessToken } from '@/lib/oauth/server';

// Remote MCP server (Streamable HTTP) with full read/write access to the CRM,
// for Claude custom connectors. Auth: OAuth 2.1 bearer token (see /api/oauth/*
// and /.well-known/oauth-*). Without a valid token: 401 + WWW-Authenticate
// pointing at the protected resource metadata, which starts the OAuth flow.

export const maxDuration = 60;

const authenticated = withMcpAuth(
  (request: Request) => {
    const store = storeFromEnv();
    if (!store) return notConfigured();
    const client = (request.auth?.extra?.clientName as string | undefined) ?? 'client OAuth';
    const ctx = { store, baseUrl: publicBaseUrl(request), actor: `claude.ai (OAuth : ${client})` };
    const handler = createMcpHandler(
      (server) => {
        registerRadarTools(server, ctx);
        registerFullCrmTools(server, ctx);
      },
      {
        serverInfo: { name: 'kruzberg-crm', version: '2.0.0' },
        instructions:
          'CRM de booking du groupe KRUZBERG (post-punk / cold wave, Lyon). Appelle get_schema avant la première écriture. ' +
          'Pour modifier : lis l’objet (get_*), puis update_* avec expected_updated_at. Rien n’est supprimé définitivement : archive_* / restore. ' +
          'Avant toute écriture en masse, utilise bulk_update en dry_run et montre l’aperçu. Demande confirmation avant d’archiver.',
      },
    );
    return handler(request);
  },
  async (_request, bearer) => {
    const config = oauthConfig();
    if (!config) return undefined;
    const ok = await verifyAccessToken(config.store, bearer, config.ownerId);
    if (!ok) return undefined;
    return {
      token: bearer!,
      clientId: ok.token.client_id,
      scopes: ok.token.scope.split(' ').filter(Boolean),
      expiresAt: ok.expiresAt,
      extra: { clientName: ok.token.client_name, userId: ok.token.user_id },
    };
  },
  { required: true, requiredScopes: [SCOPE], resourceMetadataPath: '/.well-known/oauth-protected-resource/api/mcp' },
);

export { authenticated as GET, authenticated as POST, authenticated as DELETE };
