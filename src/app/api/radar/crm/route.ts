import { createServerSupabaseClient } from '@/lib/supabase/server';
import { publicBaseUrl, storeFromEnv } from '@/lib/mcp/context';
import { withAudit } from '@/lib/mcp/audit';
import { restoreEntity } from '@/lib/mcp/crm-service';
import { createStoreRepo } from '@/lib/mcp/repo';
import { addToPipelineInput, updateStageInput } from '@/lib/mcp/schemas';
import { addToPipeline, ToolError, updateStage } from '@/lib/mcp/service';
import { DbError } from '@/lib/mcp/store';
import { formatZodError } from '@/lib/mcp/crm-service';

// "+ Pipeline" / "Marquer contacté" of the radar page: same logic as the
// add_to_pipeline / update_stage connector tools, called directly with the
// CRM session (owner only), audited as "radar (CRM)".

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ code: 'needs_reauth', message: 'Session expirée : reconnecte-toi au CRM.' }, { status: 401 });
  if (user.id !== process.env.MCP_OWNER_ID) return Response.json({ code: 'not_granted', message: 'Compte non autorisé.' }, { status: 403 });
  const store = storeFromEnv();
  if (!store) return Response.json({ code: 'server_unavailable', message: 'CRM non configuré.' }, { status: 503 });

  const body = (await request.json().catch(() => null)) as { tool?: string; args?: unknown } | null;
  const audited = withAudit(store, 'radar (CRM)', body?.tool ?? 'radar');
  const deps = {
    repo: createStoreRepo(audited),
    baseUrl: publicBaseUrl(request),
    restoreDeal: (id: string) => restoreEntity({ store: audited, baseUrl: publicBaseUrl(request) }, 'deal', id),
  };
  try {
    if (body?.tool === 'add_to_pipeline') {
      const parsed = addToPipelineInput.safeParse(body.args);
      if (!parsed.success) return Response.json({ code: 'tool_error', message: formatZodError(parsed.error) }, { status: 400 });
      return Response.json(await addToPipeline(deps, parsed.data));
    }
    if (body?.tool === 'update_stage') {
      const parsed = updateStageInput.safeParse(body.args);
      if (!parsed.success) return Response.json({ code: 'tool_error', message: formatZodError(parsed.error) }, { status: 400 });
      return Response.json(await updateStage(deps, parsed.data));
    }
    return Response.json({ code: 'tool_error', message: 'Outil inconnu.' }, { status: 400 });
  } catch (err) {
    if (err instanceof ToolError || err instanceof DbError) return Response.json({ code: 'tool_error', message: err.message }, { status: 400 });
    console.error('[radar] crm call failed', err);
    return Response.json({ code: 'upstream_error', message: 'Erreur interne du CRM.' }, { status: 500 });
  }
}
