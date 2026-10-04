import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { OAuthClient, OAuthStore, OAuthToken } from './store';

// Minimal OAuth 2.1 authorization server for the MCP connector:
// dynamic client registration (RFC 7591), authorization code + PKCE S256,
// rotating refresh tokens with reuse detection, revocation (RFC 7009).
// Only the CRM owner (MCP_OWNER_ID) can grant access.

export const SCOPE = 'crm';
export const CODE_TTL_S = 5 * 60;
export const ACCESS_TTL_S = 60 * 60;
export const REFRESH_TTL_S = 30 * 24 * 60 * 60;
export const MCP_PATH = '/api/mcp';

/** Redirect URIs a client may register: Claude's OAuth callback, plus loopback (MCP Inspector, Claude Code). */
const CLAUDE_CALLBACKS = ['https://claude.ai/api/mcp/auth_callback', 'https://claude.com/api/mcp/auth_callback'];

export class OAuthError extends Error {
  constructor(
    public code: string,
    public description: string,
    public status = 400,
  ) {
    super(description);
  }
  toResponse(headers: HeadersInit = {}) {
    return Response.json(
      { error: this.code, error_description: this.description },
      { status: this.status, headers: { 'cache-control': 'no-store', ...headers } },
    );
  }
}

export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const token = (prefix: string) => `${prefix}_${randomBytes(32).toString('base64url')}`;
const iso = (ms: number) => new Date(ms).toISOString();

function safeEqual(a: string, b: string) {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function isAllowedRedirectUri(uri: string, extra: string[] = []): boolean {
  if (CLAUDE_CALLBACKS.includes(uri) || extra.includes(uri)) return true;
  try {
    const u = new URL(uri);
    // Loopback redirects (RFC 8252 §7.3), any port: MCP Inspector, Claude Code.
    return u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1') && !u.username && !u.hash;
  } catch {
    return false;
  }
}

export function resourceUrl(origin: string) {
  return `${origin}${MCP_PATH}`;
}

export function authorizationServerMetadata(origin: string) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/api/oauth/token`,
    registration_endpoint: `${origin}/api/oauth/register`,
    revocation_endpoint: `${origin}/api/oauth/revoke`,
    response_types_supported: ['code'],
    response_modes_supported: ['query'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
    revocation_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
    scopes_supported: [SCOPE],
    service_documentation: `${origin}/`,
  };
}

export function protectedResourceMetadata(origin: string) {
  return {
    resource: resourceUrl(origin),
    authorization_servers: [origin],
    scopes_supported: [SCOPE],
    bearer_methods_supported: ['header'],
    resource_name: 'KRUZBERG CRM',
  };
}

// ---------------------------------------------------------------- registration

export async function registerClient(store: OAuthStore, body: unknown, extraRedirects: string[] = []) {
  if (!body || typeof body !== 'object') throw new OAuthError('invalid_client_metadata', 'Corps JSON attendu.');
  const b = body as Record<string, unknown>;
  const uris = b.redirect_uris;
  if (!Array.isArray(uris) || !uris.length || uris.length > 5 || !uris.every((u) => typeof u === 'string')) {
    throw new OAuthError('invalid_redirect_uri', 'redirect_uris : 1 à 5 URL attendues.');
  }
  const refused = (uris as string[]).filter((u) => !isAllowedRedirectUri(u, extraRedirects));
  if (refused.length) {
    throw new OAuthError(
      'invalid_redirect_uri',
      `redirect_uri non autorisée : ${refused.join(', ')}. Seuls le callback de Claude et les adresses locales (localhost) sont acceptés.`,
    );
  }
  const method = (b.token_endpoint_auth_method as string | undefined) ?? 'client_secret_basic';
  if (!['none', 'client_secret_post', 'client_secret_basic'].includes(method)) {
    throw new OAuthError('invalid_client_metadata', `token_endpoint_auth_method non supportée : ${method}.`);
  }
  const grants = (b.grant_types as string[] | undefined) ?? ['authorization_code', 'refresh_token'];
  if (!Array.isArray(grants) || grants.some((g) => !['authorization_code', 'refresh_token'].includes(g))) {
    throw new OAuthError('invalid_client_metadata', 'grant_types : seuls authorization_code et refresh_token sont supportés.');
  }
  const responseTypes = (b.response_types as string[] | undefined) ?? ['code'];
  if (!Array.isArray(responseTypes) || responseTypes.some((r) => r !== 'code')) {
    throw new OAuthError('invalid_client_metadata', 'response_types : seul "code" est supporté.');
  }
  const name = typeof b.client_name === 'string' ? b.client_name.trim().slice(0, 100) : '';

  const clientId = `kzc_${randomUUID()}`;
  const secret = method === 'none' ? null : token('kzcs');
  const client: OAuthClient = {
    client_id: clientId,
    client_secret_hash: secret ? sha256(secret) : null,
    client_name: name || 'Client MCP',
    redirect_uris: uris as string[],
    token_endpoint_auth_method: method as OAuthClient['token_endpoint_auth_method'],
  };
  await store.insertClient(client);
  return {
    client_id: clientId,
    ...(secret ? { client_secret: secret, client_secret_expires_at: 0 } : {}),
    client_id_issued_at: Math.floor(Date.now() / 1000),
    client_name: client.client_name,
    redirect_uris: client.redirect_uris,
    token_endpoint_auth_method: method,
    grant_types: grants,
    response_types: ['code'],
    scope: SCOPE,
  };
}

// ---------------------------------------------------------------- authorization

export interface AuthorizeParams {
  response_type?: string;
  client_id?: string;
  redirect_uri?: string;
  code_challenge?: string;
  code_challenge_method?: string;
  state?: string;
  scope?: string;
  resource?: string;
}

/**
 * Validates an authorization request. Errors about the client or redirect URI
 * must be shown to the user (never redirected); other errors are redirected.
 */
export async function validateAuthorize(store: OAuthStore, p: AuthorizeParams, origin: string) {
  if (!p.client_id) throw new OAuthError('invalid_request', 'client_id manquant.');
  const client = await store.getClient(p.client_id);
  if (!client) throw new OAuthError('invalid_client', 'Client inconnu. Supprime le connecteur dans Claude et ajoute-le à nouveau.');
  if (!p.redirect_uri || !client.redirect_uris.includes(p.redirect_uri)) {
    throw new OAuthError('invalid_request', 'redirect_uri absente ou non enregistrée pour ce client.');
  }
  const redirectError = (code: string, description: string) => ({ client, redirectError: { code, description } });
  if (p.response_type !== 'code') return redirectError('unsupported_response_type', 'response_type=code attendu.');
  if (!p.code_challenge || p.code_challenge_method !== 'S256' || !/^[A-Za-z0-9_-]{43}$/.test(p.code_challenge)) {
    return redirectError('invalid_request', 'PKCE obligatoire : code_challenge (S256) manquant ou invalide.');
  }
  if (p.resource && !sameResource(p.resource, origin)) return redirectError('invalid_target', 'resource inconnue.');
  if (p.scope && p.scope.split(' ').some((s) => s && s !== SCOPE)) return redirectError('invalid_scope', `Seul le scope "${SCOPE}" existe.`);
  return { client, redirectError: null };
}

function sameResource(resource: string, origin: string) {
  return resource.replace(/\/+$/, '') === resourceUrl(origin);
}

export function redirectWith(redirectUri: string, params: Record<string, string | undefined>) {
  const url = new URL(redirectUri);
  for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, v);
  return url.toString();
}

export async function issueCode(store: OAuthStore, p: Required<Pick<AuthorizeParams, 'client_id' | 'redirect_uri' | 'code_challenge'>> & AuthorizeParams, userId: string, now = Date.now()) {
  const code = token('kzac');
  await store.insertCode({
    code_hash: sha256(code),
    client_id: p.client_id,
    user_id: userId,
    redirect_uri: p.redirect_uri,
    code_challenge: p.code_challenge,
    scope: SCOPE,
    resource: p.resource ?? null,
    expires_at: iso(now + CODE_TTL_S * 1000),
  });
  return code;
}

// ---------------------------------------------------------------- token endpoint

/** Client authentication at the token/revocation endpoints (basic, post or public). */
async function authenticateClient(store: OAuthStore, form: URLSearchParams, authorization: string | null) {
  let clientId = form.get('client_id');
  let secret = form.get('client_secret');
  if (authorization?.toLowerCase().startsWith('basic ')) {
    const decoded = Buffer.from(authorization.slice(6), 'base64').toString();
    const i = decoded.indexOf(':');
    clientId = decodeURIComponent(decoded.slice(0, i));
    secret = decodeURIComponent(decoded.slice(i + 1));
  }
  if (!clientId) throw new OAuthError('invalid_client', 'client_id manquant.', 401);
  const client = await store.getClient(clientId);
  if (!client) throw new OAuthError('invalid_client', 'Client inconnu.', 401);
  if (client.client_secret_hash) {
    if (!secret || !safeEqual(sha256(secret), client.client_secret_hash)) {
      throw new OAuthError('invalid_client', 'Authentification du client échouée.', 401);
    }
  }
  return client;
}

function pkceS256(verifier: string) {
  return createHash('sha256').update(verifier).digest('base64url');
}

async function issueTokens(
  store: OAuthStore,
  client: OAuthClient,
  userId: string,
  familyId: string,
  now: number,
) {
  const access = token('kzat');
  const refresh = token('kzrt');
  await store.insertToken({
    id: randomUUID(),
    family_id: familyId,
    client_id: client.client_id,
    client_name: client.client_name,
    user_id: userId,
    scope: SCOPE,
    access_hash: sha256(access),
    refresh_hash: sha256(refresh),
    access_expires_at: iso(now + ACCESS_TTL_S * 1000),
    refresh_expires_at: iso(now + REFRESH_TTL_S * 1000),
  });
  return { access_token: access, token_type: 'Bearer', expires_in: ACCESS_TTL_S, refresh_token: refresh, scope: SCOPE };
}

export async function tokenRequest(
  store: OAuthStore,
  form: URLSearchParams,
  authorization: string | null,
  origin: string,
  ownerId: string,
  now = Date.now(),
) {
  const client = await authenticateClient(store, form, authorization);
  const grant = form.get('grant_type');
  const resource = form.get('resource');
  if (resource && !sameResource(resource, origin)) throw new OAuthError('invalid_target', 'resource inconnue.');

  if (grant === 'authorization_code') {
    const code = form.get('code');
    const verifier = form.get('code_verifier');
    if (!code || !verifier) throw new OAuthError('invalid_request', 'code et code_verifier sont obligatoires.');
    const row = await store.consumeCode(sha256(code), iso(now));
    if (!row) throw new OAuthError('invalid_grant', 'Code inconnu ou déjà utilisé.');
    if (Date.parse(row.expires_at) < now) throw new OAuthError('invalid_grant', 'Code expiré.');
    if (row.client_id !== client.client_id) throw new OAuthError('invalid_grant', 'Code émis pour un autre client.');
    if (row.redirect_uri !== form.get('redirect_uri')) throw new OAuthError('invalid_grant', 'redirect_uri différente de celle de la demande.');
    if (!safeEqual(pkceS256(verifier), row.code_challenge)) throw new OAuthError('invalid_grant', 'code_verifier invalide (PKCE).');
    if (row.user_id !== ownerId) throw new OAuthError('access_denied', 'Compte non autorisé.', 403);
    return issueTokens(store, client, row.user_id, randomUUID(), now);
  }

  if (grant === 'refresh_token') {
    const refresh = form.get('refresh_token');
    if (!refresh) throw new OAuthError('invalid_request', 'refresh_token manquant.');
    const row = await store.findByRefresh(sha256(refresh));
    if (!row || row.client_id !== client.client_id) throw new OAuthError('invalid_grant', 'refresh_token inconnu.');
    if (row.revoked_at) throw new OAuthError('invalid_grant', 'Accès révoqué. Reconnecte le connecteur dans Claude.');
    if (Date.parse(row.refresh_expires_at) < now) throw new OAuthError('invalid_grant', 'refresh_token expiré. Reconnecte le connecteur.');
    // Reuse of an already exchanged refresh token = possible theft: revoke the whole chain.
    if (row.rotated_at || !(await store.markRotated(row.id, iso(now)))) {
      await store.revokeFamily(row.family_id, iso(now));
      throw new OAuthError('invalid_grant', 'refresh_token déjà utilisé : accès révoqué par sécurité. Reconnecte le connecteur.');
    }
    if (row.user_id !== ownerId) throw new OAuthError('access_denied', 'Compte non autorisé.', 403);
    return issueTokens(store, client, row.user_id, row.family_id, now);
  }

  throw new OAuthError('unsupported_grant_type', 'grant_type : authorization_code ou refresh_token.');
}

export async function revokeRequest(store: OAuthStore, form: URLSearchParams, authorization: string | null, now = Date.now()) {
  const client = await authenticateClient(store, form, authorization);
  const value = form.get('token');
  if (!value) throw new OAuthError('invalid_request', 'token manquant.');
  const h = sha256(value);
  const row = (await store.findByAccess(h)) ?? (await store.findByRefresh(h));
  // RFC 7009: unknown tokens are not an error.
  if (row && row.client_id === client.client_id) await store.revokeFamily(row.family_id, iso(now));
}

// ---------------------------------------------------------------- resource server

export async function verifyAccessToken(
  store: OAuthStore,
  bearer: string | undefined,
  ownerId: string,
  now = Date.now(),
): Promise<{ token: OAuthToken; expiresAt: number } | null> {
  if (!bearer) return null;
  const row = await store.findByAccess(sha256(bearer));
  if (!row || row.revoked_at || row.user_id !== ownerId) return null;
  const expiresAtMs = Date.parse(row.access_expires_at);
  if (expiresAtMs <= now) return null;
  // Best effort, at most once a minute: shows when the access was last used.
  if (!row.last_used_at || now - Date.parse(row.last_used_at) > 60_000) {
    await store.touch(row.id, iso(now)).catch(() => {});
  }
  return { token: row, expiresAt: Math.floor(expiresAtMs / 1000) };
}
