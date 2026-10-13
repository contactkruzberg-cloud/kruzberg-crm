-- =============================================
-- Correctif : « Supprimer » échouait dans le CRM
-- =============================================
-- app_archive (016) appelait uuid_generate_v4(), qui vit dans le schéma
-- « extensions » de Supabase : avec SET search_path = public, la fonction ne
-- la trouvait pas (« function uuid_generate_v4() does not exist ») et toute
-- suppression échouait. gen_random_uuid() est intégré à Postgres.
-- Au passage : ces fonctions ne sont appelables que par un utilisateur
-- connecté (Supabase donne EXECUTE au rôle anon par défaut). Idempotent.

CREATE OR REPLACE FUNCTION app_archive(p_entity TEXT, p_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
  batch UUID := gen_random_uuid();
  ts TIMESTAMPTZ := NOW();
  tbl TEXT;
  owner UUID;
  archived_at TIMESTAMPTZ;
  v_contacts UUID[] := '{}';
  v_deals UUID[] := '{}';
  v_stops UUID[] := '{}';
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Non authentifié'; END IF;
  tbl := CASE p_entity
    WHEN 'venue' THEN 'venues' WHEN 'contact' THEN 'contacts' WHEN 'deal' THEN 'deals'
    WHEN 'task' THEN 'tasks' WHEN 'activity' THEN 'activities' WHEN 'tour' THEN 'tours'
    WHEN 'tour_stop' THEN 'tour_stops' WHEN 'tour_expense' THEN 'tour_expenses'
    WHEN 'template' THEN 'templates' WHEN 'band' THEN 'bands' END;
  IF tbl IS NULL THEN RAISE EXCEPTION 'Entité inconnue : %', p_entity; END IF;

  EXECUTE format('SELECT user_id, deleted_at FROM %I WHERE id = $1', tbl) INTO owner, archived_at USING p_id;
  IF owner IS NULL OR owner <> uid THEN RAISE EXCEPTION 'Introuvable'; END IF;
  IF archived_at IS NOT NULL THEN RAISE EXCEPTION 'Déjà archivé'; END IF;

  -- Dependents, same rules as the MCP connector (CASCADES in entities.ts).
  IF p_entity = 'venue' THEN
    SELECT COALESCE(array_agg(id), '{}') INTO v_contacts FROM contacts WHERE user_id = uid AND venue_id = p_id AND deleted_at IS NULL;
    SELECT COALESCE(array_agg(id), '{}') INTO v_deals FROM deals
      WHERE user_id = uid AND deleted_at IS NULL AND (venue_id = p_id OR (venue_id IS NULL AND contact_id = ANY(v_contacts)));
  ELSIF p_entity = 'contact' THEN
    v_contacts := ARRAY[p_id];
    SELECT COALESCE(array_agg(id), '{}') INTO v_deals FROM deals
      WHERE user_id = uid AND deleted_at IS NULL AND contact_id = p_id AND venue_id IS NULL;
  ELSIF p_entity = 'deal' THEN
    v_deals := ARRAY[p_id];
  ELSIF p_entity = 'tour' THEN
    SELECT COALESCE(array_agg(id), '{}') INTO v_stops FROM tour_stops WHERE user_id = uid AND tour_id = p_id AND deleted_at IS NULL;
  ELSIF p_entity = 'tour_stop' THEN
    v_stops := ARRAY[p_id];
  END IF;

  IF p_entity = 'venue' THEN
    UPDATE venues SET deleted_at = ts, deleted_batch = batch WHERE id = p_id;
  ELSIF p_entity NOT IN ('contact', 'deal', 'tour_stop') THEN
    EXECUTE format('UPDATE %I SET deleted_at = $1, deleted_batch = $2 WHERE id = $3', tbl) USING ts, batch, p_id;
  END IF;

  UPDATE contacts SET deleted_at = ts, deleted_batch = batch WHERE id = ANY(v_contacts) AND deleted_at IS NULL;
  -- Archived deals disappear from kruzberg.com; the flag is kept for restore.
  UPDATE deals SET deleted_at = ts, deleted_batch = batch,
    deleted_show_on_website = show_on_website, show_on_website = false
    WHERE id = ANY(v_deals) AND deleted_at IS NULL;
  UPDATE tasks SET deleted_at = ts, deleted_batch = batch
    WHERE user_id = uid AND deleted_at IS NULL
      AND (deal_id = ANY(v_deals) OR (p_entity = 'venue' AND venue_id = p_id));
  UPDATE tour_stops SET deleted_at = ts, deleted_batch = batch WHERE id = ANY(v_stops) AND deleted_at IS NULL;
  UPDATE tour_expenses SET deleted_at = ts, deleted_batch = batch
    WHERE user_id = uid AND deleted_at IS NULL
      AND ((p_entity = 'tour' AND tour_id = p_id) OR stop_id = ANY(v_stops));
  RETURN batch;
END;
$$;

REVOKE ALL ON FUNCTION app_archive(TEXT, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION app_restore(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION app_trash() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION app_purge(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app_archive(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION app_restore(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION app_trash() TO authenticated;
GRANT EXECUTE ON FUNCTION app_purge(UUID) TO authenticated;
