import { createSupabaseStore } from './supabase-store';

/** Public base URL of the CRM used in links returned to Claude. */
export function publicBaseUrl(request: Request): string {
  if (process.env.CRM_PUBLIC_URL) return process.env.CRM_PUBLIC_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return new URL(request.url).origin;
}

/** Owner-scoped Supabase store, or null when the server configuration is incomplete. */
export function storeFromEnv() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const ownerId = process.env.MCP_OWNER_ID;
  if (!supabaseUrl || !serviceRoleKey || !ownerId) {
    console.error('[mcp] missing NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY or MCP_OWNER_ID');
    return null;
  }
  return createSupabaseStore(supabaseUrl, serviceRoleKey, ownerId);
}

export const notConfigured = () => Response.json({ error: 'MCP connector is not configured on the server.' }, { status: 503 });
