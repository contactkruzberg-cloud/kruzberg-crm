import type { McpServer } from '@modelcontextprotocol/server';
import { createRateLimiter } from './rate-limit';
import {
  addToPipelineInput,
  addToPipelineOutput,
  findOpportunityInput,
  findOpportunityOutput,
  listPipelineStagesInput,
  listPipelineStagesOutput,
  updateStageInput,
  updateStageOutput,
} from './schemas';
import { addToPipeline, findOpportunity, listPipelineStages, ToolError, updateStage, type ServiceDeps } from './service';
import { DbError } from './supabase-repo';

export const RATE_LIMIT_PER_MINUTE = 60;

// Module scope: shared by every request served by this function instance.
const limiter = createRateLimiter(RATE_LIMIT_PER_MINUTE, 60_000);

function errorResult(message: string) {
  return { content: [{ type: 'text' as const, text: message }], isError: true };
}

/** Runs a tool body with rate limiting, and turns failures into explicit tool errors (never a stack trace). */
export async function runTool<T extends Record<string, unknown>>(fn: () => T | Promise<T>, take = () => limiter.take()) {
  const wait = take();
  if (wait) return errorResult(`Limite de ${RATE_LIMIT_PER_MINUTE} appels par minute atteinte. Réessaie dans ${wait} s.`);
  try {
    const result = await fn();
    return { content: [{ type: 'text' as const, text: JSON.stringify(result) }], structuredContent: result };
  } catch (err) {
    if (err instanceof ToolError || err instanceof DbError) return errorResult(err.message);
    console.error('[mcp] unexpected error', err);
    return errorResult('Erreur interne du CRM. Réessaie plus tard.');
  }
}

export function registerCrmTools(server: McpServer, deps: ServiceDeps) {
  server.registerTool(
    'add_to_pipeline',
    {
      title: 'Ajouter au pipeline',
      description:
        "Crée une opportunité dans le pipeline de booking KRUZBERG à partir d'une piste du Booking Radar, ou la met à jour si elle existe déjà. " +
        'Idempotent : dédoublonnage par external_id (source "radar"), puis par email, puis par nom normalisé + ville. ' +
        "Crée ou relie la structure (lieu, festival, label, média) et le contact, place l'opportunité à l'étape d'entrée (a_contacter) sauf si stage est fourni, " +
        "ajoute une note (why, action, support, verified) et une tâche si deadline est fournie. Une opportunité existante est complétée sans être écrasée ; son étape ne change que si stage est fourni. " +
        'Renvoie { id, created, stage, url, matched_by }.',
      inputSchema: addToPipelineInput,
      outputSchema: addToPipelineOutput,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    (args) => runTool(() => addToPipeline(deps, args)),
  );

  server.registerTool(
    'find_opportunity',
    {
      title: 'Chercher une opportunité',
      description:
        'Recherche des opportunités du pipeline par external_id (id radar), email (structure ou contact) ou nom (structure ou contact, recherche partielle). ' +
        'Les critères fournis se cumulent. Renvoie au plus 10 résultats { id, name, city, stage, external_id, url }, les plus récents en premier.',
      inputSchema: findOpportunityInput,
      outputSchema: findOpportunityOutput,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args) => runTool(() => findOpportunity(deps, args)),
  );

  server.registerTool(
    'list_pipeline_stages',
    {
      title: 'Étapes du pipeline',
      description: "Renvoie les étapes du pipeline dans l'ordre ({ id, label }) et l'étape d'entrée.",
      inputSchema: listPipelineStagesInput,
      outputSchema: listPipelineStagesOutput,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    () => runTool(() => listPipelineStages()),
  );

  server.registerTool(
    'update_stage',
    {
      title: "Changer l'étape",
      description:
        "Change l'étape d'une opportunité (id renvoyé par add_to_pipeline ou find_opportunity) et ajoute une note optionnelle à son historique. " +
        'Renvoie { id, previous_stage, stage, url }.',
      inputSchema: updateStageInput,
      outputSchema: updateStageOutput,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    (args) => runTool(() => updateStage(deps, args)),
  );
}
