import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Persistence of the OAuth 2.1 authorization server (clients, codes, tokens).
// Only SHA-256 hashes of secrets, codes and tokens are stored.

export interface OAuthClient {
  client_id: string;
  client_secret_hash: string | null;
  client_name: string;
  redirect_uris: string[];
  token_endpoint_auth_method: 'none' | 'client_secret_post' | 'client_secret_basic';
  created_at?: string;
}

export interface OAuthCode {
  code_hash: string;
  client_id: string;
  user_id: string;
  redirect_uri: string;
  code_challenge: string;
  scope: string;
  resource: string | null;
  expires_at: string;
  used_at?: string | null;
}

export interface OAuthToken {
  id: string;
  family_id: string;
  client_id: string;
  client_name: string;
  user_id: string;
  scope: string;
  access_hash: string;
  refresh_hash: string;
  access_expires_at: string;
  refresh_expires_at: string;
  rotated_at: string | null;
  revoked_at: string | null;
  last_used_at?: string | null;
  created_at?: string;
}

export interface OAuthStore {
  insertClient(client: OAuthClient): Promise<void>;
  getClient(clientId: string): Promise<OAuthClient | null>;
  insertCode(code: OAuthCode): Promise<void>;
  /** Marks the code used and returns it, atomically; null if unknown or already used. */
  consumeCode(codeHash: string, now: string): Promise<OAuthCode | null>;
  insertToken(token: Omit<OAuthToken, 'rotated_at' | 'revoked_at'>): Promise<void>;
  findByAccess(accessHash: string): Promise<OAuthToken | null>;
  findByRefresh(refreshHash: string): Promise<OAuthToken | null>;
  /** Marks the refresh token as exchanged, atomically; false if it already was. */
  markRotated(id: string, now: string): Promise<boolean>;
  revokeFamily(familyId: string, now: string): Promise<void>;
  touch(id: string, now: string): Promise<void>;
  listActive(userId: string, now: string): Promise<OAuthToken[]>;
}

class OAuthDbError extends Error {}

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new OAuthDbError(`oauth store: ${res.error.message}`);
  return res.data;
}

export function createSupabaseOAuthStore(url: string, serviceRoleKey: string): OAuthStore {
  const db: SupabaseClient = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  return {
    async insertClient(client) {
      check(await db.from('oauth_clients').insert(client));
    },
    async getClient(clientId) {
      return check(await db.from('oauth_clients').select('*').eq('client_id', clientId).maybeSingle()) as OAuthClient | null;
    },
    async insertCode(code) {
      check(await db.from('oauth_codes').insert(code));
    },
    async consumeCode(codeHash, now) {
      const rows = check(
        await db.from('oauth_codes').update({ used_at: now }).eq('code_hash', codeHash).is('used_at', null).select('*'),
      ) as OAuthCode[];
      return rows[0] ?? null;
    },
    async insertToken(token) {
      check(await db.from('oauth_tokens').insert(token));
    },
    async findByAccess(accessHash) {
      return check(await db.from('oauth_tokens').select('*').eq('access_hash', accessHash).maybeSingle()) as OAuthToken | null;
    },
    async findByRefresh(refreshHash) {
      return check(await db.from('oauth_tokens').select('*').eq('refresh_hash', refreshHash).maybeSingle()) as OAuthToken | null;
    },
    async markRotated(id, now) {
      const rows = check(await db.from('oauth_tokens').update({ rotated_at: now }).eq('id', id).is('rotated_at', null).select('id'));
      return (rows as unknown[]).length > 0;
    },
    async revokeFamily(familyId, now) {
      check(await db.from('oauth_tokens').update({ revoked_at: now }).eq('family_id', familyId).is('revoked_at', null));
    },
    async touch(id, now) {
      check(await db.from('oauth_tokens').update({ last_used_at: now }).eq('id', id));
    },
    async listActive(userId, now) {
      return check(
        await db
          .from('oauth_tokens')
          .select('*')
          .eq('user_id', userId)
          .is('revoked_at', null)
          .is('rotated_at', null)
          .gt('refresh_expires_at', now)
          .order('created_at', { ascending: false }),
      ) as OAuthToken[];
    },
  };
}
