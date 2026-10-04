import { createMcpHandler } from 'mcp-handler';
import { isValidSecret } from '@/lib/mcp/auth';
import { notConfigured, publicBaseUrl, storeFromEnv } from '@/lib/mcp/context';
import { registerRadarTools } from '@/lib/mcp/tools';

// Remote MCP server (Streamable HTTP) used by the KRUZBERG Booking Radar.
// Connector URL: <CRM URL>/api/mcp/<MCP_SECRET>
// Auth: secret in the path; any request with a wrong secret gets a 404.
// Deliberately limited to the 4 radar tools: if this URL leaks, it cannot be
// used to read or change the rest of the CRM. Full access: /api/mcp (OAuth).

const notFound = () => new Response('Not Found', { status: 404 });

async function handle(request: Request, ctx: { params: Promise<{ secret: string }> }) {
  const { secret } = await ctx.params;
  if (!isValidSecret(secret, process.env.MCP_SECRET)) return notFound();

  const store = storeFromEnv();
  if (!store) return notConfigured();

  const mcp = { store, baseUrl: publicBaseUrl(request), actor: 'radar (URL secrète)' };
  const handler = createMcpHandler((server) => registerRadarTools(server, mcp), {
    serverInfo: { name: 'kruzberg-crm', version: '1.0.0' },
  });
  return handler(request);
}

export { handle as GET, handle as POST, handle as DELETE };
