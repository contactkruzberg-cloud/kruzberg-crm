import { createMcpHandler } from 'mcp-handler';
import { isValidSecret } from '@/lib/mcp/auth';
import { createSupabaseRepo } from '@/lib/mcp/supabase-repo';
import { registerCrmTools } from '@/lib/mcp/tools';

// Remote MCP server (Streamable HTTP) used as a claude.ai custom connector by
// the KRUZBERG Booking Radar. Connector URL: <CRM URL>/api/mcp/<MCP_SECRET>
// Auth v1: secret in the path. Any request with a wrong secret gets a 404.

const notFound = () => new Response('Not Found', { status: 404 });

function publicBaseUrl(request: Request): string {
  if (process.env.CRM_PUBLIC_URL) return process.env.CRM_PUBLIC_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return new URL(request.url).origin;
}

async function handle(request: Request, ctx: { params: Promise<{ secret: string }> }) {
  const { secret } = await ctx.params;
  if (!isValidSecret(secret, process.env.MCP_SECRET)) return notFound();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const ownerId = process.env.MCP_OWNER_ID;
  if (!supabaseUrl || !serviceRoleKey || !ownerId) {
    console.error('[mcp] missing NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY or MCP_OWNER_ID');
    return Response.json({ error: 'MCP connector is not configured on the server.' }, { status: 503 });
  }

  const deps = { repo: createSupabaseRepo(supabaseUrl, serviceRoleKey, ownerId), baseUrl: publicBaseUrl(request) };
  const handler = createMcpHandler((server) => registerCrmTools(server, deps), {
    serverInfo: { name: 'kruzberg-crm', version: '1.0.0' },
  });
  return handler(request);
}

export { handle as GET, handle as POST, handle as DELETE };
