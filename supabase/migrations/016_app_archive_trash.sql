-- =============================================
-- Suppressions annulables dans l'app + corbeille
-- =============================================
-- Dans le CRM, « Supprimer » archive désormais (comme le connecteur MCP) :
-- l'élément et ses dépendants reçoivent le même deleted_batch, ce qui permet
-- « Annuler » et la restauration depuis la Corbeille (Réglages).
-- Les politiques RLS masquent les lignes archivées à l'app ; ces fonctions
-- sont donc SECURITY DEFINER et vérifient elles-mêmes le propriétaire
-- (auth.uid()). Idempotent.

CREATE OR REPLACE FUNCTION app_archive(p_entity TEXT, p_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
  batch UUID := uuid_generate_v4();
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

CREATE OR REPLACE FUNCTION app_restore(p_batch UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
  n INTEGER := 0;
  c INTEGER;
  t TEXT;
  blocker TEXT;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Non authentifié'; END IF;

  -- Refuse when a parent was archived separately (it would come back orphaned).
  SELECT v.name INTO blocker FROM contacts x JOIN venues v ON v.id = x.venue_id
    WHERE x.deleted_batch = p_batch AND x.user_id = uid AND v.deleted_at IS NOT NULL AND v.deleted_batch IS DISTINCT FROM p_batch LIMIT 1;
  IF blocker IS NULL THEN
    SELECT v.name INTO blocker FROM deals x JOIN venues v ON v.id = x.venue_id
      WHERE x.deleted_batch = p_batch AND x.user_id = uid AND v.deleted_at IS NOT NULL AND v.deleted_batch IS DISTINCT FROM p_batch LIMIT 1;
  END IF;
  IF blocker IS NULL THEN
    SELECT v.name INTO blocker FROM tasks x JOIN deals d ON d.id = x.deal_id LEFT JOIN venues v ON v.id = d.venue_id
      WHERE x.deleted_batch = p_batch AND x.user_id = uid AND d.deleted_at IS NOT NULL AND d.deleted_batch IS DISTINCT FROM p_batch LIMIT 1;
  END IF;
  IF blocker IS NULL THEN
    SELECT tr.name INTO blocker FROM tour_stops x JOIN tours tr ON tr.id = x.tour_id
      WHERE x.deleted_batch = p_batch AND x.user_id = uid AND tr.deleted_at IS NOT NULL AND tr.deleted_batch IS DISTINCT FROM p_batch LIMIT 1;
  END IF;
  IF blocker IS NOT NULL THEN
    RAISE EXCEPTION 'Restaure d''abord « % », archivé séparément.', blocker;
  END IF;

  UPDATE deals SET deleted_at = NULL, deleted_batch = NULL,
    show_on_website = COALESCE(deleted_show_on_website, show_on_website), deleted_show_on_website = NULL
    WHERE deleted_batch = p_batch AND user_id = uid;
  GET DIAGNOSTICS c = ROW_COUNT; n := n + c;
  FOREACH t IN ARRAY ARRAY['venues','contacts','tasks','activities','tours','tour_stops','tour_expenses','templates','bands'] LOOP
    EXECUTE format('UPDATE %I SET deleted_at = NULL, deleted_batch = NULL WHERE deleted_batch = $1 AND user_id = $2', t) USING p_batch, uid;
    GET DIAGNOSTICS c = ROW_COUNT; n := n + c;
  END LOOP;
  RETURN n;
END;
$$;

-- Contenu de la corbeille : une ligne par élément archivé.
CREATE OR REPLACE FUNCTION app_trash()
RETURNS TABLE (entity TEXT, id UUID, name TEXT, deleted_at TIMESTAMPTZ, batch UUID)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'venue', v.id, v.name, v.deleted_at, v.deleted_batch FROM venues v WHERE v.user_id = auth.uid() AND v.deleted_at IS NOT NULL
  UNION ALL SELECT 'contact', c.id, c.name, c.deleted_at, c.deleted_batch FROM contacts c WHERE c.user_id = auth.uid() AND c.deleted_at IS NOT NULL
  UNION ALL SELECT 'deal', d.id, COALESCE(NULLIF(d.title, ''), v.name, c.name, 'Opportunité'), d.deleted_at, d.deleted_batch
    FROM deals d LEFT JOIN venues v ON v.id = d.venue_id LEFT JOIN contacts c ON c.id = d.contact_id
    WHERE d.user_id = auth.uid() AND d.deleted_at IS NOT NULL
  UNION ALL SELECT 'task', t.id, t.title, t.deleted_at, t.deleted_batch FROM tasks t WHERE t.user_id = auth.uid() AND t.deleted_at IS NOT NULL
  UNION ALL SELECT 'activity', a.id, LEFT(a.content, 80), a.deleted_at, a.deleted_batch FROM activities a WHERE a.user_id = auth.uid() AND a.deleted_at IS NOT NULL
  UNION ALL SELECT 'tour', t.id, t.name, t.deleted_at, t.deleted_batch FROM tours t WHERE t.user_id = auth.uid() AND t.deleted_at IS NOT NULL
  UNION ALL SELECT 'tour_stop', s.id, COALESCE(s.city, '') || ' ' || s.stop_date::TEXT, s.deleted_at, s.deleted_batch FROM tour_stops s WHERE s.user_id = auth.uid() AND s.deleted_at IS NOT NULL
  UNION ALL SELECT 'tour_expense', e.id, e.label || ' (' || e.amount::TEXT || ' €)', e.deleted_at, e.deleted_batch FROM tour_expenses e WHERE e.user_id = auth.uid() AND e.deleted_at IS NOT NULL
  UNION ALL SELECT 'template', t.id, t.name, t.deleted_at, t.deleted_batch FROM templates t WHERE t.user_id = auth.uid() AND t.deleted_at IS NOT NULL
  UNION ALL SELECT 'band', b.id, b.name, b.deleted_at, b.deleted_batch FROM bands b WHERE b.user_id = auth.uid() AND b.deleted_at IS NOT NULL
  ORDER BY 4 DESC;
$$;

-- Suppression définitive d'un lot depuis la corbeille (action explicite de l'utilisateur).
CREATE OR REPLACE FUNCTION app_purge(p_batch UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
  n INTEGER := 0;
  c INTEGER;
  t TEXT;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Non authentifié'; END IF;
  FOREACH t IN ARRAY ARRAY['tasks','tour_expenses','tour_stops','activities','deals','contacts','venues','tours','templates','bands'] LOOP
    EXECUTE format('DELETE FROM %I WHERE deleted_batch = $1 AND user_id = $2 AND deleted_at IS NOT NULL', t) USING p_batch, uid;
    GET DIAGNOSTICS c = ROW_COUNT; n := n + c;
  END LOOP;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION app_archive(TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_restore(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_trash() FROM PUBLIC;
REVOKE ALL ON FUNCTION app_purge(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_archive(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION app_restore(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION app_trash() TO authenticated;
GRANT EXECUTE ON FUNCTION app_purge(UUID) TO authenticated;
