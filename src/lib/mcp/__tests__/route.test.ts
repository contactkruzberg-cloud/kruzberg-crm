import { afterEach, describe, expect, it } from 'vitest';
import { isValidSecret } from '../auth';
import { createRateLimiter } from '../rate-limit';
import { countryName, mapVenueType, normalizeName, parseCapacity } from '../normalize';
import { POST } from '@/app/api/mcp/[secret]/route';

const SECRET = 'a'.repeat(48);
const env = { ...process.env };
afterEach(() => {
  process.env = { ...env };
});

const post = (secret: string) =>
  POST(
    new Request(`https://crm.test/api/mcp/${secret}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    }),
    { params: Promise.resolve({ secret }) },
  );

describe('route /api/mcp/[secret]', () => {
  it('returns 404 for a wrong secret', async () => {
    process.env.MCP_SECRET = SECRET;
    expect((await post('b'.repeat(48))).status).toBe(404);
    expect((await post(SECRET.slice(1))).status).toBe(404);
  });

  it('returns 404 when MCP_SECRET is unset or too short (connector disabled)', async () => {
    delete process.env.MCP_SECRET;
    expect((await post(SECRET)).status).toBe(404);
    process.env.MCP_SECRET = 'short';
    expect((await post('short')).status).toBe(404);
  });

  it('returns 503 without leaking details when the server config is incomplete', async () => {
    process.env.MCP_SECRET = SECRET;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const res = await post(SECRET);
    expect(res.status).toBe(503);
    expect(await res.text()).not.toContain('SUPABASE');
  });
});

describe('isValidSecret', () => {
  it('compares exactly', () => {
    expect(isValidSecret(SECRET, SECRET)).toBe(true);
    expect(isValidSecret(SECRET + 'x', SECRET)).toBe(false);
    expect(isValidSecret('', undefined)).toBe(false);
  });
});

describe('createRateLimiter', () => {
  it('allows 60 calls per minute then asks to wait', () => {
    let t = 0;
    const rl = createRateLimiter(60, 60_000, () => t);
    for (let i = 0; i < 60; i++) expect(rl.take()).toBe(0);
    expect(rl.take()).toBe(60);
    t = 30_000;
    expect(rl.take()).toBe(30);
    t = 60_000;
    expect(rl.take()).toBe(0);
  });
});

describe('normalize helpers', () => {
  it('normalizes names', () => {
    expect(normalizeName("  L'Épicerie  Moderne & Co ! ")).toBe('l epicerie moderne et co');
  });
  it('parses capacities', () => {
    expect(parseCapacity('300 debout')).toBe(300);
    expect(parseCapacity('~1 200')).toBe(1200);
    expect(parseCapacity('n/c')).toBeNull();
    expect(parseCapacity(450)).toBe(450);
  });
  it('maps venue types', () => {
    expect(mapVenueType('booking_fr', 'Café-concert')).toBe('cafe_concert');
    expect(mapVenueType('booking_eu', 'club')).toBe('salle');
    expect(mapVenueType('pros', 'label')).toBe('other');
    expect(mapVenueType('pros', 'tourneur')).toBe('organisateur');
    expect(mapVenueType('tremplins', 'tremplin')).toBe('organisateur');
  });
  it('converts ISO countries to French names', () => {
    expect(countryName(undefined)).toBe('France');
    expect(countryName('de')).toBe('Allemagne');
  });
});
