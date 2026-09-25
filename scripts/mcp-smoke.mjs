#!/usr/bin/env node
// Smoke test of the deployed MCP connector, against the real database.
//
//   node scripts/mcp-smoke.mjs [base URL]
//
// Asks for MCP_SECRET and the Vercel "Protection Bypass for Automation" token
// (hidden input; leave the token empty in production), or reads them from the
// MCP_SECRET / VERCEL_BYPASS environment variables. Creates one test deal
// "TEST MCP — à supprimer" (external_id test-mcp-001): delete it afterwards.

import readline from 'node:readline';

const base = (process.argv[2] || 'https://kruzberg-crm.vercel.app').replace(/\/+$/, '');

function ask(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    process.stdout.write(question);
    rl._writeToOutput = () => {}; // hide what is typed or pasted
    rl.question('', (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer.trim());
    });
  });
}

const secret = process.env.MCP_SECRET || (await ask('MCP_SECRET (masqué) : '));
const bypass = process.env.VERCEL_BYPASS ?? (await ask('Jeton Protection Bypass (masqué, vide en production) : '));

let id = 0;
async function rpc(method, params, path = secret) {
  const res = await fetch(`${base}/api/mcp/${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': '2025-06-18',
      ...(bypass ? { 'x-vercel-protection-bypass': bypass } : {}),
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }),
  });
  const text = await res.text();
  const data = text.split('\n').find((l) => l.startsWith('data: '));
  let json = null;
  try {
    json = JSON.parse(data ? data.slice(6) : text);
  } catch {}
  return { status: res.status, json, text };
}

const call = async (name, args = {}) => (await rpc('tools/call', { name, arguments: args })).json?.result;

let failures = 0;
function check(label, ok, detail = '') {
  if (!ok) failures++;
  console.log(`${ok ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`);
}

console.log(`\nTest du connecteur MCP sur ${base}\n`);

const wrong = await rpc('tools/list', undefined, 'mauvais-secret');
check('Mauvais secret → 404', wrong.status === 404, `HTTP ${wrong.status}${wrong.status === 401 ? ' (protection Vercel : jeton bypass manquant ou faux)' : ''}`);

const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'smoke', version: '1' } });
check('initialize', init.status === 200 && init.json?.result?.serverInfo?.name === 'kruzberg-crm', `HTTP ${init.status}`);
if (init.status !== 200) {
  console.log(`\nArrêt : ${init.status === 404 ? 'MCP_SECRET incorrect.' : init.status === 401 ? 'jeton de contournement Vercel manquant ou incorrect.' : init.text.slice(0, 200)}`);
  process.exit(1);
}

const tools = (await rpc('tools/list')).json?.result?.tools?.map((t) => t.name).sort() ?? [];
check('4 outils exposés', tools.join() === 'add_to_pipeline,find_opportunity,list_pipeline_stages,update_stage', tools.join(', '));

const stages = await call('list_pipeline_stages');
check('list_pipeline_stages', stages?.structuredContent?.stages?.length === 8, stages?.structuredContent?.stages?.map((s) => s.id).join(', '));

const lead = {
  external_id: 'test-mcp-001',
  category: 'booking_fr',
  name: 'TEST MCP — à supprimer',
  type: 'bar-concert',
  city: 'Testville',
  contact_name: 'Contact Test MCP',
  emails: ['test-mcp@example.com'],
  fit: 2,
  why: 'Test du connecteur MCP',
  action: 'Supprimer cette opportunité',
  verified: new Date().toISOString().slice(0, 10),
};
const first = await call('add_to_pipeline', lead);
if (first?.isError) console.log(`   erreur : ${first.content?.[0]?.text}`);
check('add_to_pipeline (1er appel) → created: true', first?.structuredContent?.created === true, first?.structuredContent?.url);

const second = await call('add_to_pipeline', lead);
check(
  'add_to_pipeline (2e appel) → created: false, même id',
  second?.structuredContent?.created === false && second?.structuredContent?.id === first?.structuredContent?.id,
);

const found = await call('find_opportunity', { external_id: 'test-mcp-001' });
check('find_opportunity → 1 résultat', found?.structuredContent?.results?.length === 1);

const moved = await call('update_stage', { id: first?.structuredContent?.id ?? '00000000-0000-4000-8000-000000000000', stage: 'contacte', note: 'Note de test MCP' });
check('update_stage → contacte', moved?.structuredContent?.stage === 'contacte');

const invalid = await call('update_stage', { id: first?.structuredContent?.id, stage: 'inconnue' });
check('Étape inconnue → erreur explicite', invalid?.isError === true, invalid?.content?.[0]?.text?.slice(0, 80));

console.log(failures ? `\n${failures} échec(s).` : '\nTout est OK.');
if (first?.structuredContent?.url) console.log(`Fiche de test à supprimer : ${first.structuredContent.url}`);
process.exit(failures ? 1 : 0);
