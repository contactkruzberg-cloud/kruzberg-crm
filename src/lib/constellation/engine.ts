import { randomUUID } from 'node:crypto';
import type { Store } from '@/lib/mcp/store';
import { aggregate } from './aggregate';
import { mutate, type Launch, type Loaded } from './docs';
import { isNoise, slug } from './normalize';
import { BAND_SCHEMA, DISCOVER_SCHEMA, SYNTHESIS_SCHEMA, bandPrompt, discoverPrompt, rosterPrompt, synthesisPrompt } from './prompts';
import { SEED_BANDS, SEED_WATCH } from './seed';
import {
  ANGLE_LABEL,
  STAGE_LABEL,
  type Band,
  type Db,
  type DiscoverAngle,
  type EntityKind,
  type Finding,
  type Job,
  type JobKind,
  type Milestone,
  type Scene,
  type Stage,
  type Synthesis,
} from './types';

// Le moteur de Constellation dans le CRM. Les recherches ne tournent plus sur
// le Mac : elles attendent en file (collection jobs) et une routine Claude,
// réveillée par le CRM, les prend une à une par le connecteur MCP
// (constellation_next_job), fait la recherche web et rend le résultat
// (constellation_submit_job), que ce fichier range dans la constellation.

/** Une recherche prise depuis plus longtemps est considérée comme abandonnée et remise en file. */
export const STALE_MS = 25 * 60_000;
/** Nombre maximal de routines lancées en parallèle. */
export const MAX_WORKERS = 3;
/** Délai laissé à une routine lancée pour prendre sa première recherche. */
const FIRE_GRACE_MS = 4 * 60_000;

// ---------------------------------------------------------------- file

export function enqueue(db: Db, kind: JobKind, target: string | undefined, label: string, opts: { autoExplore?: boolean } = {}): Job | null {
  const dup = db.jobs.find((j) => j.kind === kind && j.target === target && (j.status === 'queued' || j.status === 'running'));
  if (dup) return null;
  const j: Job = { id: randomUUID(), kind, target, label, status: 'queued', requestedAt: new Date().toISOString() };
  if (opts.autoExplore) j.autoExplore = true;
  db.jobs.push(j);
  if (kind === 'band') {
    const b = db.bands.find((x) => x.id === target);
    if (b) {
      b.status = 'queued';
      delete b.error;
      j.label = b.name;
    }
  }
  return j;
}

function requeueStale(db: Db, now = Date.now()) {
  for (const j of db.jobs) {
    if (j.status !== 'running' || now - Date.parse(j.startedAt ?? j.requestedAt) < STALE_MS) continue;
    j.status = 'queued';
    delete j.startedAt;
    const b = j.kind === 'band' ? db.bands.find((x) => x.id === j.target) : undefined;
    if (b) b.status = 'queued';
  }
}

// Priorités : découvertes et catalogues, puis groupes lyonnais (le local d'abord), puis le reste ; la synthèse en dernier.
function rank(db: Db, j: Job) {
  if (j.kind === 'discover' || j.kind === 'discover_lyon' || j.kind === 'roster') return 0;
  if (j.kind === 'synthesis') return 3;
  const b = db.bands.find((x) => x.id === j.target);
  return b?.scene === 'lyon' || b?.origin === 'lyon' ? 1 : 2;
}

export interface Brief {
  job: { id: string; kind: JobKind; label: string };
  instructions: string;
  output_schema: object;
  web_search: boolean;
  remaining: number;
}

/** La routine prend la prochaine recherche : elle passe « en cours » et on lui remet les consignes. */
export function claimNext(store: Store): Promise<Brief | { job: null; remaining: 0 }> {
  return mutate(store, (l) => {
    const { db } = l;
    requeueStale(db);
    l.launch.activeAt = new Date().toISOString();
    const queued = db.jobs.filter((j) => j.status === 'queued').sort((a, b) => rank(db, a) - rank(db, b) || a.requestedAt.localeCompare(b.requestedAt));
    for (const j of queued) {
      let built: ReturnType<typeof build>;
      try {
        built = build(j, db);
      } catch (e) {
        finishIn(db, j.id, { status: 'error', error: e instanceof Error ? e.message : String(e) });
        continue;
      }
      j.status = 'running';
      j.startedAt = new Date().toISOString();
      if (j.kind === 'band') {
        const b = db.bands.find((x) => x.id === j.target);
        if (b) b.status = 'running';
      }
      return {
        job: { id: j.id, kind: j.kind, label: j.label },
        instructions: built.prompt,
        output_schema: built.schema,
        web_search: built.web,
        remaining: queued.length - 1,
      };
    }
    return { job: null, remaining: 0 as const };
  });
}

/** La routine rend une recherche : résultat (objet conforme au schéma) ou erreur. */
export function submit(store: Store, args: { job_id: string; output?: unknown; error?: string }) {
  return mutate(store, (l) => {
    const { db } = l;
    l.launch.activeAt = new Date().toISOString();
    const job = db.jobs.find((j) => j.id === args.job_id);
    if (!job) throw new EngineError(`Recherche introuvable : ${args.job_id}.`);
    if (job.status !== 'running') throw new EngineError(`La recherche « ${job.label} » n’est pas en cours (statut : ${job.status}). Prends la suivante avec constellation_next_job.`);
    const remaining = () => db.jobs.filter((j) => j.status === 'queued').length;
    if (args.error || args.output == null) {
      const msg = args.error?.trim() || 'Aucun résultat rendu.';
      finishIn(db, job.id, { status: 'error', error: msg });
      if (job.kind === 'band') {
        const b = db.bands.find((x) => x.id === job.target);
        if (b) {
          b.status = 'error';
          b.error = msg;
        }
      }
      return { ok: true, status: 'error' as const, added: 0, remaining: remaining() };
    }
    let res: { added: number; explore: string[] };
    try {
      res = apply(db, job, args.output);
    } catch (e) {
      throw new EngineError(`Résultat illisible pour « ${job.label} » : ${e instanceof Error ? e.message : String(e)}. Respecte output_schema puis rends-le à nouveau.`);
    }
    finishIn(db, job.id, { status: 'done', added: res.added });
    // Découverte en mode « recherche massive » : on explore aussitôt les groupes très proches.
    for (const id of res.explore) enqueue(db, 'band', id, id);
    return { ok: true, status: 'done' as const, added: res.added, remaining: remaining() };
  });
}

export class EngineError extends Error {}

function finishIn(db: Db, id: string, patch: Partial<Job>) {
  const j = db.jobs.find((x) => x.id === id);
  if (!j) return;
  Object.assign(j, patch, { doneAt: new Date().toISOString() });
  if (patch.status === 'done') delete j.error;
}

// ---------------------------------------------------------------- routine

/**
 * Combien de routines lancer maintenant : autant que de recherches en file,
 * plafonné à MAX_WORKERS, moins celles qui tournent déjà. Rien si un
 * lancement récent n'a pas encore eu le temps de démarrer.
 */
export function workersToFire(db: Db, launch: Launch, now = Date.now()): number {
  const queued = db.jobs.filter((j) => j.status === 'queued').length;
  if (!queued) return 0;
  const last = launch.fires.at(-1);
  if (last && now - Date.parse(last) < FIRE_GRACE_MS) return 0;
  const running = db.jobs.filter((j) => j.status === 'running' && now - Date.parse(j.startedAt ?? j.requestedAt) < STALE_MS).length;
  return Math.max(0, Math.min(MAX_WORKERS, queued) - running);
}

// ---------------------------------------------------------------- actions de la page

export type Action =
  | { type: 'addBand'; name: string; city?: string; country?: string; why?: string; reference?: boolean }
  | { type: 'setReference'; id: string; reference: boolean }
  | { type: 'discover'; angle: DiscoverAngle; autoExplore?: boolean }
  | { type: 'discoverAll'; autoExplore?: boolean }
  | { type: 'synthesis' }
  | { type: 'setBandStatus'; id: string; status: 'idle' | 'rejected' }
  | { type: 'exploreBand'; id: string }
  | { type: 'exploreAll' }
  | { type: 'discoverLyon' }
  | { type: 'roster'; key: string; name: string }
  | { type: 'cancelJob'; id: string }
  | { type: 'entity'; key: string; hidden?: boolean; mergedInto?: string | null; note?: string };

export class ActionError extends Error {}

/** Applique une action de la page ; renvoie le résultat à afficher. */
export function applyAction(l: Loaded, a: Action): Record<string, unknown> {
  const { db } = l;
  switch (a.type) {
    case 'addBand': {
      const name = a.name?.trim();
      if (!name) throw new ActionError('Nom du groupe manquant');
      const id = slug(name) || randomUUID();
      if (db.bands.some((b) => b.id === id)) throw new ActionError('Ce groupe est déjà dans la constellation');
      const b: Band = { id, name, origin: a.reference ? 'reference' : 'manuel', status: 'idle', addedAt: new Date().toISOString() };
      if (a.city?.trim()) b.city = a.city.trim();
      if (a.country?.trim()) b.country = a.country.trim();
      if (a.why?.trim()) b.why = a.why.trim();
      if (a.reference) b.reference = true;
      db.bands.push(b);
      return { ok: true, id };
    }
    case 'setBandStatus': {
      const b = db.bands.find((x) => x.id === a.id);
      if (b) b.status = a.status === 'idle' && b.exploredAt ? 'done' : a.status;
      return { ok: true };
    }
    case 'exploreBand':
      return { ok: true, job: enqueue(db, 'band', a.id, a.id) };
    case 'exploreAll': {
      const todo = db.bands.filter((b) => b.status === 'idle' || b.status === 'error');
      for (const b of todo) enqueue(db, 'band', b.id, b.name);
      return { ok: true, count: todo.length };
    }
    case 'discoverLyon':
      return { ok: true, job: enqueue(db, 'discover', 'lyon_scene', ANGLE_LABEL.lyon_scene) };
    case 'discover':
      if (!ANGLE_LABEL[a.angle]) throw new ActionError('Angle inconnu');
      return { ok: true, job: enqueue(db, 'discover', a.angle, ANGLE_LABEL[a.angle], { autoExplore: a.autoExplore }) };
    case 'discoverAll': {
      // Recherche massive : le local d'abord (conseil de Francis), puis la France et l'Europe.
      const angles = Object.keys(ANGLE_LABEL) as DiscoverAngle[];
      for (const angle of angles) enqueue(db, 'discover', angle, ANGLE_LABEL[angle], { autoExplore: a.autoExplore });
      return { ok: true, count: angles.length };
    }
    case 'synthesis':
      return { ok: true, job: enqueue(db, 'synthesis', 'all', 'Patterns de réussite') };
    case 'setReference': {
      const b = db.bands.find((x) => x.id === a.id);
      if (b) {
        if (a.reference) b.reference = true;
        else delete b.reference;
      }
      return { ok: true };
    }
    case 'roster':
      return { ok: true, job: enqueue(db, 'roster', a.key, a.name) };
    case 'cancelJob': {
      const j = db.jobs.find((x) => x.id === a.id);
      if (j && j.status === 'queued') {
        finishIn(db, j.id, { status: 'error', error: 'Annulée' });
        const b = j.kind === 'band' ? db.bands.find((x) => x.id === j.target) : undefined;
        if (b) b.status = b.exploredAt ? 'done' : 'idle';
      }
      return { ok: true };
    }
    case 'entity': {
      const o = (db.overrides[a.key] ??= {});
      if (a.hidden !== undefined) {
        if (a.hidden) o.hidden = true;
        else delete o.hidden;
      }
      if (a.mergedInto !== undefined) {
        if (a.mergedInto && a.mergedInto !== a.key) o.mergedInto = a.mergedInto;
        else delete o.mergedInto;
      }
      if (a.note !== undefined) {
        if (a.note) o.note = a.note;
        else delete o.note;
      }
      return { ok: true };
    }
  }
  throw new ActionError('Action inconnue');
}

/** Base de départ quand la constellation est vide : la niche du Radar et les noms cités en séance. */
export function seed(db: Db) {
  if (db.bands.length || db.watch.length) return;
  const now = new Date().toISOString();
  db.bands.push(...SEED_BANDS.map((b) => ({ ...b, status: 'idle' as const, addedAt: now })));
  db.watch.push(...SEED_WATCH);
}

// ---------------------------------------------------------------- consignes et rangement

function knownNames(db: Db) {
  return db.bands.map((b) => b.name);
}

function build(job: Job, db: Db): { prompt: string; schema: object; web: boolean } {
  if (job.kind === 'band') {
    const b = db.bands.find((x) => x.id === job.target);
    if (!b) throw new Error('Groupe introuvable');
    return { prompt: bandPrompt(b), schema: BAND_SCHEMA, web: true };
  }
  if (job.kind === 'discover' || job.kind === 'discover_lyon') {
    const angle = (job.kind === 'discover_lyon' ? 'lyon_scene' : job.target) as DiscoverAngle;
    if (!ANGLE_LABEL[angle]) throw new Error('Angle de découverte inconnu');
    return { prompt: discoverPrompt(angle, knownNames(db)), schema: DISCOVER_SCHEMA, web: true };
  }
  if (job.kind === 'synthesis') return { prompt: synthesisPrompt(dossier(db)), schema: SYNTHESIS_SCHEMA, web: false };
  const ent = aggregate(db).find((e) => e.key === job.target);
  if (!ent) throw new Error('Acteur introuvable');
  return {
    prompt: rosterPrompt({ name: ent.name, kind: ent.kind, city: ent.city, note: ent.watch?.note ?? ent.note }, knownNames(db)),
    schema: DISCOVER_SCHEMA,
    web: true,
  };
}

/** Le dossier remis à la synthèse : trajectoires datées et acteurs récurrents. */
function dossier(db: Db): string {
  const bands = db.bands
    .filter((b) => b.status === 'done' && b.milestones?.length)
    .sort((a, b) => Number(!!b.reference) - Number(!!a.reference));
  const lines: string[] = ['## Trajectoires'];
  for (const b of bands) {
    lines.push(`\n### ${b.name}${b.reference ? ' [groupe à succès]' : ''} — ${[b.city, b.country].filter(Boolean).join(', ')}${b.formedYear ? `, formé en ${b.formedYear}` : ''}`);
    for (const m of b.milestones!) lines.push(`- ${m.when ?? m.year} · ${STAGE_LABEL[m.stage]} · ${m.title}${m.actor ? ` (${m.actor})` : ''}`);
    if (b.lesson) lines.push(`Leçon relevée : ${b.lesson}`);
  }
  const ents = aggregate(db).filter((e) => e.bandIds.length >= 2).slice(0, 80);
  const name = new Map(db.bands.map((b) => [b.id, b.name]));
  lines.push('\n## Acteurs qui reviennent (≥ 2 groupes)');
  for (const e of ents) lines.push(`- ${e.name} (${e.kind}${e.city ? `, ${e.city}` : ''}) : ${e.bandIds.map((id) => name.get(id) ?? id).join(', ')}`);
  return lines.join('\n');
}

const KINDS: EntityKind[] = ['tourneur', 'label', 'salle', 'festival', 'organisateur', 'tete_affiche', 'plateau', 'media', 'dispositif'];

function sceneOf(city?: string, country?: string): Scene | undefined {
  const c = (city ?? '').toLowerCase();
  if (/lyon|villeurbanne|vaulx|saint-étienne|saint-etienne|grenoble/.test(c)) return 'lyon';
  if (!country) return undefined;
  return /france/i.test(country) ? 'france' : 'europe';
}

function clean(s: unknown): string | undefined {
  return typeof s === 'string' && s.trim() ? s.trim() : undefined;
}

/** Retire les clés vides : les documents restent compacts. */
function compact<T extends object>(o: T): T {
  for (const [k, v] of Object.entries(o)) if (v === undefined) delete (o as Record<string, unknown>)[k];
  return o;
}

function apply(db: Db, job: Job, output: unknown): { added: number; explore: string[] } {
  if (!output || typeof output !== 'object') throw new Error('objet JSON attendu');
  if (job.kind === 'synthesis') {
    const o = output as Omit<Synthesis, 'generatedAt'>;
    if (!Array.isArray(o.patterns)) throw new Error('patterns manquant');
    db.synthesis = { ...o, generatedAt: new Date().toISOString() };
    return { added: o.patterns.length, explore: [] };
  }
  if (job.kind === 'band') {
    const o = output as { band?: Record<string, string>; findings?: Array<Record<string, unknown>>; milestones?: Array<Record<string, unknown>> };
    if (!o.band || !Array.isArray(o.findings)) throw new Error('band et findings attendus');
    const b = db.bands.find((x) => x.id === job.target);
    if (!b) return { added: 0, explore: [] };
    b.city = clean(o.band.city) ?? b.city;
    b.country = clean(o.band.country) ?? b.country;
    b.genre = clean(o.band.genre) ?? b.genre;
    b.scene = sceneOf(b.city, b.country) ?? b.scene;
    b.summary = clean(o.band.summary);
    b.lesson = clean(o.band.lesson);
    b.links = compact({ website: clean(o.band.website), bandcamp: clean(o.band.bandcamp), instagram: clean(o.band.instagram) });
    const fy = Number(o.band.formedYear);
    b.formedYear = fy > 1950 && fy < 2030 ? fy : b.formedYear;
    b.milestones = (o.milestones ?? [])
      .map((m): Milestone | null => {
        const year = Number(m.year);
        const title = clean(m.title);
        const sourceUrl = clean(m.sourceUrl);
        if (!(year > 1950 && year < 2030) || !title || !sourceUrl) return null;
        return compact({
          year,
          when: clean(m.when),
          stage: (m.stage as Stage) in STAGE_LABEL ? (m.stage as Stage) : 'autre',
          title,
          actor: clean(m.actor),
          actorKind: KINDS.includes(m.actorKind as EntityKind) ? (m.actorKind as EntityKind) : undefined,
          sourceUrl,
        });
      })
      .filter((m): m is Milestone => !!m)
      .sort((a, c) => (a.when ?? String(a.year)).localeCompare(c.when ?? String(c.year)));
    b.status = 'done';
    delete b.error;
    b.exploredAt = new Date().toISOString();
    compact(b);
    // Une nouvelle exploration remplace l'ancienne.
    db.findings = db.findings.filter((f) => f.bandId !== b.id);
    const fresh: Finding[] = [];
    for (const r of o.findings) {
      const kind = r.kind as EntityKind;
      const name = clean(r.name);
      const sourceUrl = clean(r.sourceUrl);
      if (!KINDS.includes(kind) || !name || !sourceUrl) continue;
      if (isNoise({ name, detail: clean(r.detail), bandId: b.id })) continue;
      fresh.push(
        compact({
          id: randomUUID(),
          bandId: b.id,
          kind,
          name,
          city: clean(r.city),
          country: clean(r.country),
          when: clean(r.when),
          detail: clean(r.detail),
          capacity: typeof r.capacity === 'number' && r.capacity > 0 ? r.capacity : undefined,
          scale: (['local', 'national', 'international'] as const).find((s) => s === r.scale),
          website: clean(r.website),
          sourceUrl,
        }),
      );
    }
    db.findings.push(...fresh);
    return { added: fresh.length, explore: [] };
  }

  const o = output as { bands?: Array<Record<string, string | number>> };
  if (!Array.isArray(o.bands)) throw new Error('bands attendu');
  const angle = job.kind === 'discover_lyon' ? 'lyon_scene' : job.target;
  const local = angle === 'lyon_scene' || angle === 'lyon_agendas' || angle === 'aura_dispositifs';
  const origin: Band['origin'] = job.kind === 'roster' ? 'catalogue' : local ? 'lyon' : 'decouverte';
  let added = 0;
  const explore: string[] = [];
  for (const r of o.bands) {
    const name = clean(r.name);
    if (!name) continue;
    const id = slug(name);
    if (!id || db.bands.some((b) => b.id === id)) continue;
    const city = clean(r.city);
    const country = clean(r.country);
    const fit = Math.min(5, Math.max(1, Math.round(Number(r.fit) || 3)));
    // Très proche (4-5) : retenu d'office ; sinon à trier à la main.
    const keep = fit >= 4;
    if (keep && job.autoExplore) explore.push(id);
    db.bands.push(
      compact({
        id,
        name,
        city,
        country,
        genre: clean(r.genre),
        scene: sceneOf(city, country),
        origin,
        why: [clean(r.why), job.kind === 'roster' ? `(catalogue : ${job.label})` : `(${job.label})`].filter(Boolean).join(' '),
        links: compact({ website: clean(r.sourceUrl) }),
        fit,
        status: keep ? ('idle' as const) : ('suggested' as const),
        addedAt: new Date().toISOString(),
      }),
    );
    added++;
  }
  return { added, explore };
}
