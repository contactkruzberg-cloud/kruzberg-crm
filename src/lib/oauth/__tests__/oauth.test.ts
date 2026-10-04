import { createHash, randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import {
  ACCESS_TTL_S,
  authorizationServerMetadata,
  CODE_TTL_S,
  isAllowedRedirectUri,
  issueCode,
  OAuthError,
  protectedResourceMetadata,
  registerClient,
  revokeRequest,
  tokenRequest,
  validateAuthorize,
  verifyAccessToken,
} from '../server';
import type { OAuthClient, OAuthCode, OAuthStore, OAuthToken } from '../store';
import { middleware } from '@/middleware';
import { GET as resourceMetadataRoute } from '@/app/.well-known/oauth-protected-resource/[[...path]]/route';
import { GET as asMetadataRoute } from '@/app/.well-known/oauth-authorization-server/[[...path]]/route';
import { POST as mcpRoute } from '@/app/api/mcp/route';

const ORIGIN = 'https://crm.test';
const OWNER = '11111111-1111-4111-8111-111111111111';
const CLAUDE_CB = 'https://claude.ai/api/mcp/auth_callback';

function memoryOAuthStore() {
  const clients: OAuthClient[] = [];
  const codes: OAuthCode[] = [];
  const tokens: OAuthToken[] = [];
  const store: OAuthStore = {
    insertClient: async (c) => void clients.push({ ...c }),
    getClient: async (id) => clients.find((c) => c.client_id === id) ?? null,
    insertCode: async (c) => void codes.push({ ...c, used_at: null }),
    async consumeCode(hash, now) {
      const c = codes.find((x) => x.code_hash === hash && !x.used_at);
      if (!c) return null;
      c.used_at = now;
      return { ...c };
    },
    insertToken: async (t) => void tokens.push({ ...t, rotated_at: null, revoked_at: null }),
    findByAccess: async (h) => tokens.find((t) => t.access_hash === h) ?? null,
    findByRefresh: async (h) => tokens.find((t) => t.refresh_hash === h) ?? null,
    async markRotated(id, now) {
      const t = tokens.find((x) => x.id === id && !x.rotated_at);
      if (!t) return false;
      t.rotated_at = now;
      return true;
    },
    async revokeFamily(f, now) {
      for (const t of tokens) if (t.family_id === f && !t.revoked_at) t.revoked_at = now;
    },
    async touch(id, now) {
      tokens.find((t) => t.id === id)!.last_used_at = now;
    },
    listActive: async (u) => tokens.filter((t) => t.user_id === u && !t.revoked_at && !t.rotated_at),
  };
  return { store, clients, codes, tokens };
}

const verifier = 'v'.repeat(20) + randomUUID() + 'x'.repeat(10);
const challenge = createHash('sha256').update(verifier).digest('base64url');
const form = (o: Record<string, string>) => new URLSearchParams(o);

let mem: ReturnType<typeof memoryOAuthStore>;
beforeEach(() => {
  mem = memoryOAuthStore();
});

async function publicClient() {
  return registerClient(mem.store, { client_name: 'Claude', redirect_uris: [CLAUDE_CB], token_endpoint_auth_method: 'none' });
}

async function codeFor(clientId: string, now = Date.now(), user = OWNER) {
  return issueCode(mem.store, { client_id: clientId, redirect_uri: CLAUDE_CB, code_challenge: challenge, resource: `${ORIGIN}/api/mcp` }, user, now);
}

async function tokensFor(clientId: string) {
  const code = await codeFor(clientId);
  return tokenRequest(
    mem.store,
    form({ grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: CLAUDE_CB, client_id: clientId, resource: `${ORIGIN}/api/mcp` }),
    null,
    ORIGIN,
    OWNER,
  );
}

async function expectOAuthError(p: Promise<unknown>, code: string) {
  const err = await p.then(() => null, (e) => e);
  expect(err).toBeInstanceOf(OAuthError);
  expect((err as OAuthError).code).toBe(code);
  return err as OAuthError;
}

describe('discovery metadata', () => {
  it('protected resource points at this server as authorization server', async () => {
    const res = resourceMetadataRoute(new Request(`${ORIGIN}/.well-known/oauth-protected-resource/api/mcp`));
    expect(await res.json()).toMatchObject({ resource: `${ORIGIN}/api/mcp`, authorization_servers: [ORIGIN], scopes_supported: ['crm'] });
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(protectedResourceMetadata(ORIGIN).resource).toBe(`${ORIGIN}/api/mcp`);
  });

  it('authorization server advertises DCR, PKCE S256 and the endpoints', async () => {
    const m = await asMetadataRoute(new Request(`${ORIGIN}/.well-known/oauth-authorization-server`)).json();
    expect(m).toEqual(authorizationServerMetadata(ORIGIN));
    expect(m).toMatchObject({
      issuer: ORIGIN,
      authorization_endpoint: `${ORIGIN}/oauth/authorize`,
      token_endpoint: `${ORIGIN}/api/oauth/token`,
      registration_endpoint: `${ORIGIN}/api/oauth/register`,
      code_challenge_methods_supported: ['S256'],
    });
  });
});

describe('dynamic client registration', () => {
  it("registers Claude's callback (public client) and a confidential client with a secret", async () => {
    const pub = await publicClient();
    expect(pub.client_id).toMatch(/^kzc_/);
    expect(pub).not.toHaveProperty('client_secret');
    const conf = await registerClient(mem.store, { redirect_uris: ['https://claude.com/api/mcp/auth_callback'] });
    expect(conf.client_secret).toMatch(/^kzcs_/);
    expect(mem.clients[1].client_secret_hash).not.toContain(conf.client_secret);
  });

  it('refuses foreign redirect URIs and unsupported metadata', async () => {
    await expectOAuthError(registerClient(mem.store, { redirect_uris: ['https://evil.example/cb'] }), 'invalid_redirect_uri');
    await expectOAuthError(registerClient(mem.store, { redirect_uris: [] }), 'invalid_redirect_uri');
    await expectOAuthError(registerClient(mem.store, { redirect_uris: [CLAUDE_CB], grant_types: ['client_credentials'] }), 'invalid_client_metadata');
    expect(isAllowedRedirectUri('http://localhost:6274/oauth/callback')).toBe(true);
    expect(isAllowedRedirectUri('https://localhost/cb')).toBe(false);
    expect(isAllowedRedirectUri('https://claude.ai/other')).toBe(false);
  });
});

describe('authorization request validation', () => {
  it('accepts a complete request and rejects unknown clients and redirect URIs (shown, not redirected)', async () => {
    const c = await publicClient();
    const base = { client_id: c.client_id, redirect_uri: CLAUDE_CB, response_type: 'code', code_challenge: challenge, code_challenge_method: 'S256', resource: `${ORIGIN}/api/mcp` };
    expect((await validateAuthorize(mem.store, base, ORIGIN)).redirectError).toBeNull();
    await expectOAuthError(validateAuthorize(mem.store, { ...base, client_id: 'kzc_nope' }, ORIGIN), 'invalid_client');
    await expectOAuthError(validateAuthorize(mem.store, { ...base, redirect_uri: 'https://claude.com/api/mcp/auth_callback' }, ORIGIN), 'invalid_request');
  });

  it('redirects back with an error when PKCE, response_type, scope or resource is wrong', async () => {
    const c = await publicClient();
    const base = { client_id: c.client_id, redirect_uri: CLAUDE_CB, response_type: 'code', code_challenge: challenge, code_challenge_method: 'S256' };
    expect((await validateAuthorize(mem.store, { ...base, code_challenge_method: 'plain' }, ORIGIN)).redirectError?.code).toBe('invalid_request');
    expect((await validateAuthorize(mem.store, { ...base, response_type: 'token' }, ORIGIN)).redirectError?.code).toBe('unsupported_response_type');
    expect((await validateAuthorize(mem.store, { ...base, scope: 'admin' }, ORIGIN)).redirectError?.code).toBe('invalid_scope');
    expect((await validateAuthorize(mem.store, { ...base, resource: 'https://other.test/api/mcp' }, ORIGIN)).redirectError?.code).toBe('invalid_target');
  });
});

describe('token endpoint', () => {
  it('exchanges a code + PKCE verifier for an access token that the MCP endpoint accepts', async () => {
    const c = await publicClient();
    const t = await tokensFor(c.client_id);
    expect(t).toMatchObject({ token_type: 'Bearer', expires_in: ACCESS_TTL_S, scope: 'crm' });
    expect(t.access_token).toMatch(/^kzat_/);
    expect(mem.tokens[0].access_hash).not.toBe(t.access_token);
    const ok = await verifyAccessToken(mem.store, t.access_token, OWNER);
    expect(ok?.token.client_name).toBe('Claude');
  });

  it('rejects a wrong verifier, a reused code, an expired code, a wrong redirect_uri or client', async () => {
    const c = await publicClient();
    const other = await publicClient();
    const ex = (code: string, o: Record<string, string> = {}) =>
      tokenRequest(mem.store, form({ grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: CLAUDE_CB, client_id: c.client_id, ...o }), null, ORIGIN, OWNER);

    await expectOAuthError(ex(await codeFor(c.client_id), { code_verifier: 'w'.repeat(50) }), 'invalid_grant');
    const code = await codeFor(c.client_id);
    await ex(code);
    await expectOAuthError(ex(code), 'invalid_grant');
    await expectOAuthError(ex(await codeFor(c.client_id, Date.now() - (CODE_TTL_S + 1) * 1000)), 'invalid_grant');
    await expectOAuthError(ex(await codeFor(c.client_id), { redirect_uri: 'http://localhost:1/cb' }), 'invalid_grant');
    await expectOAuthError(ex(await codeFor(other.client_id)), 'invalid_grant');
    await expectOAuthError(ex(await codeFor(c.client_id), { resource: 'https://x.test/api/mcp' }), 'invalid_target');
  });

  it('only the CRM owner can obtain tokens', async () => {
    const c = await publicClient();
    const code = await codeFor(c.client_id, Date.now(), '22222222-2222-4222-8222-222222222222');
    const err = await expectOAuthError(
      tokenRequest(mem.store, form({ grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: CLAUDE_CB, client_id: c.client_id }), null, ORIGIN, OWNER),
      'access_denied',
    );
    expect(err.status).toBe(403);
  });

  it('authenticates confidential clients (basic and post) and refuses a wrong secret', async () => {
    const c = await registerClient(mem.store, { redirect_uris: [CLAUDE_CB] });
    const basic = `Basic ${Buffer.from(`${c.client_id}:${c.client_secret}`).toString('base64')}`;
    const params = async () => ({ grant_type: 'authorization_code', code: await codeFor(c.client_id), code_verifier: verifier, redirect_uri: CLAUDE_CB });
    expect((await tokenRequest(mem.store, form(await params()), basic, ORIGIN, OWNER)).access_token).toBeTruthy();
    expect((await tokenRequest(mem.store, form({ ...(await params()), client_id: c.client_id, client_secret: c.client_secret! }), null, ORIGIN, OWNER)).access_token).toBeTruthy();
    const err = await expectOAuthError(tokenRequest(mem.store, form({ ...(await params()), client_id: c.client_id, client_secret: 'nope' }), null, ORIGIN, OWNER), 'invalid_client');
    expect(err.status).toBe(401);
  });

  it('rotates refresh tokens and revokes the whole chain when an old one is replayed', async () => {
    const c = await publicClient();
    const t1 = await tokensFor(c.client_id);
    const refresh = (rt: string) => tokenRequest(mem.store, form({ grant_type: 'refresh_token', refresh_token: rt, client_id: c.client_id }), null, ORIGIN, OWNER);
    const t2 = await refresh(t1.refresh_token);
    expect(t2.refresh_token).not.toBe(t1.refresh_token);
    expect(await verifyAccessToken(mem.store, t2.access_token, OWNER)).not.toBeNull();
    await expectOAuthError(refresh(t1.refresh_token), 'invalid_grant'); // replay
    expect(await verifyAccessToken(mem.store, t2.access_token, OWNER)).toBeNull();
    await expectOAuthError(refresh(t2.refresh_token), 'invalid_grant');
  });

  it('rejects unsupported grants', async () => {
    const c = await publicClient();
    await expectOAuthError(tokenRequest(mem.store, form({ grant_type: 'password', client_id: c.client_id }), null, ORIGIN, OWNER), 'unsupported_grant_type');
  });
});

describe('access tokens', () => {
  it('expire after one hour and are refused for another owner', async () => {
    const c = await publicClient();
    const t = await tokensFor(c.client_id);
    expect(await verifyAccessToken(mem.store, t.access_token, OWNER, Date.now() + (ACCESS_TTL_S + 1) * 1000)).toBeNull();
    expect(await verifyAccessToken(mem.store, t.access_token, '22222222-2222-4222-8222-222222222222')).toBeNull();
    expect(await verifyAccessToken(mem.store, 'kzat_forged', OWNER)).toBeNull();
    expect(await verifyAccessToken(mem.store, undefined, OWNER)).toBeNull();
  });

  it('can be revoked (RFC 7009)', async () => {
    const c = await publicClient();
    const t = await tokensFor(c.client_id);
    await revokeRequest(mem.store, form({ token: t.refresh_token, client_id: c.client_id }), null);
    expect(await verifyAccessToken(mem.store, t.access_token, OWNER)).toBeNull();
    await revokeRequest(mem.store, form({ token: 'unknown', client_id: c.client_id }), null); // not an error
  });
});

describe('/api/mcp (OAuth-protected endpoint)', () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });

  it('answers 401 with a WWW-Authenticate challenge pointing at the resource metadata', async () => {
    delete process.env.MCP_OWNER_ID;
    const res = await mcpRoute(
      new Request(`${ORIGIN}/api/mcp`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: 'Bearer kzat_forged' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
      }),
    );
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toContain(`resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource/api/mcp"`);
  });
});

describe('middleware', () => {
  const run = (path: string) => middleware(new NextRequest(`${ORIGIN}${path}`));

  it('lets the connector and OAuth endpoints through without a CRM session', async () => {
    for (const p of ['/api/mcp', '/api/oauth/token', '/api/oauth/register', '/.well-known/oauth-authorization-server', '/.well-known/oauth-protected-resource/api/mcp']) {
      const res = await run(p);
      expect(res.status, p).toBe(200);
      expect(res.headers.get('location'), p).toBeNull();
    }
  });

  it('answers 404 on discovery URLs that do not exist here', async () => {
    for (const p of ['/.well-known/openid-configuration', '/register', '/authorize', '/token']) {
      expect((await run(p)).status, p).toBe(404);
    }
  });
});
