import { createServerSupabaseClient } from '@/lib/supabase/server';
import { RADAR_COLLECTIONS, type RadarCollection } from '@/lib/mcp/radar';

// Document store of the Booking Radar page (/radar), with the CRM session.
// Row Level Security restricts every read and write to the logged-in owner.

const isCollection = (c: unknown): c is RadarCollection => RADAR_COLLECTIONS.includes(c as RadarCollection);
const ID = /^[A-Za-z0-9_.~:@+-]{1,200}$/;
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });

async function session() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function GET(request: Request) {
  const { supabase, user } = await session();
  if (!user) return json({ error: 'not_authenticated' }, 401);
  const collection = new URL(request.url).searchParams.get('collection');
  if (!isCollection(collection)) return json({ error: 'bad_collection' }, 400);
  const docs: { id: string; data: unknown; version: number }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('radar_docs')
      .select('id, data, version')
      .eq('collection', collection)
      .order('id')
      .range(from, from + 999);
    if (error) return json({ error: error.message }, 500);
    docs.push(...data);
    if (data.length < 1000) break;
  }
  return json({ docs });
}

/** { op: "set" | "update" | "add", collection, id?, data } → { id, version } */
export async function POST(request: Request) {
  const { supabase, user } = await session();
  if (!user) return json({ error: 'not_authenticated' }, 401);
  const body = (await request.json().catch(() => null)) as { op?: string; collection?: string; id?: string; data?: Record<string, unknown> } | null;
  if (!body || !isCollection(body.collection) || !body.data || typeof body.data !== 'object') return json({ error: 'bad_request' }, 400);
  const { op, collection, data } = body;
  const id = op === 'add' ? Math.random().toString(36).slice(2, 12) + Date.now().toString(36) : body.id;
  if (!id || !ID.test(id)) return json({ error: 'bad_id' }, 400);

  if (op === 'add' || op === 'set') {
    const { data: row, error } = await supabase
      .from('radar_docs')
      .upsert({ user_id: user.id, collection, id, data }, { onConflict: 'user_id,collection,id' })
      .select('id, version')
      .single();
    if (error) return json({ error: error.message }, 500);
    return json(row);
  }
  if (op === 'update') {
    // Shallow merge, retried once if someone (the daily search) wrote in between.
    for (let attempt = 0; attempt < 2; attempt++) {
      const { data: current, error: readError } = await supabase
        .from('radar_docs')
        .select('data, version')
        .eq('collection', collection)
        .eq('id', id)
        .maybeSingle();
      if (readError) return json({ error: readError.message }, 500);
      if (!current) return json({ error: 'not_found' }, 404);
      const merged: Record<string, unknown> = { ...(current.data as Record<string, unknown>) };
      for (const [k, v] of Object.entries(data)) {
        if (v && typeof v === 'object' && !Array.isArray(v) && (v as { __delete__?: boolean }).__delete__ === true) delete merged[k];
        else merged[k] = v;
      }
      const { data: rows, error } = await supabase
        .from('radar_docs')
        .update({ data: merged })
        .eq('collection', collection)
        .eq('id', id)
        .eq('version', current.version)
        .select('id, version');
      if (error) return json({ error: error.message }, 500);
      if (rows.length) return json(rows[0]);
    }
    return json({ error: 'conflict' }, 409);
  }
  return json({ error: 'bad_op' }, 400);
}
