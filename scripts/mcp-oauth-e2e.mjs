#!/usr/bin/env node
// End-to-end test of the OAuth MCP connector, through MCP Inspector (CLI mode).
//
//   node scripts/mcp-oauth-e2e.mjs [base URL]
//
// 1. Registers an OAuth client (DCR) with a loopback redirect, opens the
//    consent page in the browser (click "Autoriser"), exchanges the code (PKCE).
// 2. Runs MCP Inspector against <base>/api/mcp with the bearer token: lists the
//    tools, reads, creates a test venue, updates it, checks the version
//    conflict, archives/restores it, bulk_update dry run, audit log.
// 3. Archives the test venue and revokes the token.
// The token is never printed nor written to disk.

import { createHash, randomBytes } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import http from 'node:http';

const base = (process.argv[2] || 'https://kruzberg-crm.vercel.app').replace(/\/+$/, '');
const INSPECTOR = ['-y', '@modelcontextprotocol/inspector@2.9.0', '--cli', `${base}/api/mcp`, '--transport', 'http'];

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};

// ---------------------------------------------------------------- OAuth
const meta = await (await fetch(`${base}/.well-known/oauth-authorization-server`)).json();
check('Découverte OAuth', meta.issuer === base && meta.code_challenge_methods_supported?.includes('S256'));

const server = http.createServer();
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const redirectUri = `http://127.0.0.1:${server.address().port}/callback`;

const reg = await fetch(meta.registration_endpoint, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ client_name: 'MCP Inspector (test E2E)', redirect_uris: [redirectUri], token_endpoint_auth_method: 'none' }),
});
const client = await reg.json();
check('Enregistrement dynamique du client (DCR)', reg.status === 201 && !!client.client_id);

const verifier = randomBytes(32).toString('base64url');
const challenge = createHash('sha256').update(verifier).digest('base64url');
const state = randomBytes(16).toString('hex');
const authUrl = new URL(meta.authorization_endpoint);
for (const [k, v] of Object.entries({
  response_type: 'code', client_id: client.client_id, redirect_uri: redirectUri, code_challenge: challenge,
  code_challenge_method: 'S256', state, scope: 'crm', resource: `${base}/api/mcp`,
})) authUrl.searchParams.set(k, v);

console.log('\n👉 Une page du CRM s’ouvre dans le navigateur : clique « Autoriser ».\n');
execFile('open', [authUrl.toString()]);

const code = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('Pas de réponse après 5 minutes.')), 5 * 60_000);
  server.on('request', (req, res) => {
    const u = new URL(req.url, redirectUri);
    if (u.pathname !== '/callback') return res.end();
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end('<p style="font-family:sans-serif">Test E2E : autorisation reçue, tu peux fermer cet onglet.</p>');
    clearTimeout(timer);
    if (u.searchParams.get('state') !== state) return reject(new Error('state différent'));
    if (u.searchParams.get('error')) return reject(new Error(`Refusé : ${u.searchParams.get('error')}`));
    resolve(u.searchParams.get('code'));
  });
});
server.close();
check('Consentement + code d’autorisation', !!code);

const tokRes = await fetch(meta.token_endpoint, {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: redirectUri, client_id: client.client_id, resource: `${base}/api/mcp` }),
});
const tokens = await tokRes.json();
check('Échange du code (PKCE) contre un jeton', tokRes.ok && !!tokens.access_token, `expire dans ${tokens.expires_in} s`);

const replay = await fetch(meta.token_endpoint, {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: redirectUri, client_id: client.client_id }),
});
check('Code déjà utilisé refusé', replay.status === 400);

// ---------------------------------------------------------------- MCP Inspector
function inspector(args) {
  return new Promise((resolve) => {
    const p = spawn('npx', [...INSPECTOR, '--header', `Authorization: Bearer ${tokens.access_token}`, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('close', (status) => {
      try {
        resolve({ status, json: JSON.parse(out) });
      } catch {
        resolve({ status, json: null, raw: (out + err).slice(0, 500) });
      }
    });
  });
}
const tool = async (name, args = {}) => {
  const a = Object.entries(args).flatMap(([k, v]) => ['--tool-arg', `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`]);
  const r = await inspector(['--method', 'tools/call', '--tool-name', name, ...a]);
  const result = r.json ?? {};
  return { error: result.isError ? result.content?.[0]?.text : r.json ? null : r.raw, data: result.structuredContent };
};

const list = await inspector(['--method', 'tools/list']);
const names = list.json?.tools?.map((t) => t.name) ?? [];
check('tools/list via Inspector', names.length === 53, `${names.length} outils`);

const schema = await tool('get_schema');
check('get_schema', !schema.error && schema.data?.pipeline?.stages?.length === 8, schema.error ?? '');

const deals = await tool('list_deals', { limit: 3 });
check('list_deals (limit 3)', !deals.error && deals.data?.items?.length <= 3, deals.error ?? `${deals.data?.items?.length} opportunités`);

const name = `TEST MCP E2E ${new Date().toISOString().slice(0, 16)}`;
const created = await tool('create_venue', { name, type: 'other', city: 'Testville', notes: 'Créé par scripts/mcp-oauth-e2e.mjs — archivé automatiquement.' });
check('create_venue', !created.error && !!created.data?.id, created.error ?? '');
const id = created.data?.id;

if (id) {
  const found = await tool('search', { query: name, entities: ['venue'] });
  check('search retrouve la fiche', found.data?.results?.[0]?.id === id, found.error ?? '');

  const upd = await tool('update_venue', { id, expected_updated_at: created.data.updated_at, patch: { capacity: 99 } });
  check('update_venue (patch + version)', !upd.error && upd.data?.capacity === 99, upd.error ?? '');

  const stale = await tool('update_venue', { id, expected_updated_at: created.data.updated_at, patch: { capacity: 1 } });
  check('Conflit de version détecté', !!stale.error && stale.error.includes('Conflit de version'));

  const bad = await tool('update_venue', { id, expected_updated_at: upd.data?.updated_at, patch: { type: 'stade' } });
  check('Erreur lisible sur valeur invalide', !!bad.error && bad.error.includes('Valeurs possibles'), bad.error?.slice(0, 120));

  const dry = await tool('bulk_update', { entity: 'venue', items: [{ id, patch: { fit_score: 5 } }] });
  check('bulk_update en dry_run par défaut', dry.data?.dry_run === true && dry.data?.summary?.will_change === 1, dry.error ?? '');

  const arch = await tool('archive_venue', { id });
  check('archive_venue (soft delete)', arch.data?.archived?.archived === true, arch.error ?? '');
  const rest = await tool('restore', { entity: 'venue', id });
  check('restore', rest.data?.restored?.archived === false, rest.error ?? '');

  const audit = await tool('get_audit_log', { entity_id: id });
  const actions = audit.data?.items?.map((e) => e.action) ?? [];
  check('get_audit_log (avant/après)', ['create', 'update', 'archive', 'restore'].every((a) => actions.includes(a)), actions.join(', '));

  const cleanup = await tool('archive_venue', { id });
  check('Nettoyage : fiche de test archivée', !cleanup.error, cleanup.error ?? '');
}

// ---------------------------------------------------------------- revoke
await fetch(meta.revocation_endpoint, {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ token: tokens.refresh_token, client_id: client.client_id }),
});
const after = await fetch(`${base}/api/mcp`, {
  method: 'POST',
  headers: { authorization: `Bearer ${tokens.access_token}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
  body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
});
check('Jeton révoqué → 401', after.status === 401);

console.log(failures ? `\n${failures} échec(s).` : '\nTout est vert.');
process.exit(failures ? 1 : 0);
