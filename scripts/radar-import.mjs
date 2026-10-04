#!/usr/bin/env node
// One-off import of the Booking Radar database (exported from the claude.ai
// artifact as JSON files: <dir>/<collection>/<id>.json) into the CRM, through
// the OAuth MCP connector (tool radar_batch). Safe to re-run: existing
// documents are replaced, pinned to their current version. Then initialises
// the two-way sync state (radar_sync_baseline).
//
//   node scripts/radar-import.mjs <export dir> [base URL]
//
// A CRM page opens in the browser: click "Autoriser". The token is revoked at the end.

import { createHash, randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import http from 'node:http';

const dir = process.argv[2];
const base = (process.argv[3] || 'https://kruzberg-crm.vercel.app').replace(/\/+$/, '');
if (!dir || !existsSync(dir)) {
  console.error('Usage : node scripts/radar-import.mjs <dossier export> [URL]');
  process.exit(1);
}

// ---------------------------------------------------------------- OAuth
const meta = await (await fetch(`${base}/.well-known/oauth-authorization-server`)).json();
const server = http.createServer();
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const redirectUri = `http://127.0.0.1:${server.address().port}/callback`;
const client = await (
  await fetch(meta.registration_endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ client_name: 'Import du Booking Radar', redirect_uris: [redirectUri], token_endpoint_auth_method: 'none' }),
  })
).json();
const verifier = randomBytes(32).toString('base64url');
const state = randomBytes(16).toString('hex');
const auth = new URL(meta.authorization_endpoint);
for (const [k, v] of Object.entries({
  response_type: 'code', client_id: client.client_id, redirect_uri: redirectUri, state, scope: 'crm', resource: `${base}/api/mcp`,
  code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256',
})) auth.searchParams.set(k, v);
console.log('👉 Une page du CRM s’ouvre : clique « Autoriser ».');
execFile('open', [auth.toString()]);
const code = await new Promise((resolve, reject) => {
  setTimeout(() => reject(new Error('Pas de réponse après 5 minutes.')), 5 * 60_000).unref();
  server.on('request', (req, res) => {
    const u = new URL(req.url, redirectUri);
    if (u.pathname !== '/callback') return res.end();
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end('<p style="font-family:sans-serif">Import autorisé, tu peux fermer cet onglet.</p>');
    if (u.searchParams.get('state') !== state || u.searchParams.get('error')) return reject(new Error('Autorisation refusée.'));
    resolve(u.searchParams.get('code'));
  });
});
server.close();
const tokens = await (
  await fetch(meta.token_endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: redirectUri, client_id: client.client_id }),
  })
).json();
if (!tokens.access_token) throw new Error('Jeton non obtenu.');

let rpcId = 0;
async function tool(name, args) {
  const res = await fetch(`${base}/api/mcp`, {
    method: 'POST',
    headers: { authorization: `Bearer ${tokens.access_token}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-06-18' },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method: 'tools/call', params: { name, arguments: args } }),
  });
  const text = await res.text();
  const line = text.split('\n').find((l) => l.startsWith('data: '));
  const { result, error } = JSON.parse(line ? line.slice(6) : text);
  if (error || result.isError) throw new Error(error ? JSON.stringify(error) : result.content[0].text);
  return result.structuredContent;
}

// ---------------------------------------------------------------- import
let total = 0;
try {
  for (const collection of ['config', 'runs', 'outbox', 'leads']) {
    const path = `${dir}/${collection}`;
    if (!existsSync(path)) continue;
    const docs = readdirSync(path).filter((f) => f.endsWith('.json')).map((f) => ({ id: f.slice(0, -5), data: JSON.parse(readFileSync(`${path}/${f}`, 'utf8')) }));
    const versions = new Map();
    for (let cursor = null; ; ) {
      const page = await tool('radar_list', { collection, fields: ['name'], limit: 1000, ...(cursor ? { cursor } : {}) });
      page.docs.forEach((d) => versions.set(d.id, d.version));
      if (!(cursor = page.next_cursor)) break;
    }
    for (let i = 0; i < docs.length; i += 40) {
      const writes = docs.slice(i, i + 40).map((d) => ({
        op: 'set', collection, id: d.id, data: d.data, ...(versions.has(d.id) ? { if_version: versions.get(d.id) } : {}),
      }));
      const r = await tool('radar_batch', { writes });
      total += r.written;
      process.stdout.write(`\r${collection} : ${Math.min(i + 40, docs.length)}/${docs.length}   `);
    }
    console.log();
  }
  // Common starting point for the two-way sync with the artifact.
  for (const collection of ['config', 'runs', 'outbox', 'leads']) {
    try {
      const b = await tool('radar_sync_baseline', { collection });
      console.log(`Synchro initialisée : ${collection} (${b.baselined})`);
    } catch (err) {
      console.log(`Synchro ${collection} : ${err.message}`);
    }
  }
  const check = await tool('radar_list', { collection: 'leads', fields: ['name'], limit: 1 });
  console.log(`✅ ${total} documents importés. Pistes dans le CRM : ${check.total}.`);
} finally {
  await fetch(meta.revocation_endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token: tokens.refresh_token, client_id: client.client_id }),
  });
}
