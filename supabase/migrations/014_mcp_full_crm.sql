-- =============================================
-- Connecteur MCP complet (lecture + écriture de tout le CRM depuis Claude)
-- =============================================
-- 1. Archivage restaurable (soft delete) : deleted_at + deleted_batch
-- 2. L'app ne voit plus les lignes archivées (politiques RLS SELECT)
-- 3. updated_at sur activities et tour_expenses (contrôle de version)
-- 4. Activités : types relance / appel / message (DM) + canal
-- 5. Date de relance saisie à la main : n'est plus écrasée par le trigger
-- 6. Journal d'audit des écritures MCP
-- 7. Tables OAuth 2.1 (clients, codes, jetons) pour le connecteur Claude
-- Idempotent : peut être relancée sans risque.

-- ---------------------------------------------
-- 1. Archivage restaurable
-- ---------------------------------------------
-- deleted_at   : date d'archivage (NULL = actif)
-- deleted_batch: même valeur pour tout ce qui a été archivé ensemble
--                (ex. une structure + ses contacts + ses opportunités),
--                pour tout restaurer d'un coup.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['venues','contacts','deals','tasks','activities','tours','tour_stops','tour_expenses','templates']
  LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS deleted_batch UUID', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (deleted_batch) WHERE deleted_batch IS NOT NULL', 'idx_' || t || '_deleted_batch', t);
  END LOOP;
END $$;

-- Une opportunité archivée ne doit plus apparaître sur kruzberg.com (vue
-- public_shows) : l'archivage met show_on_website à false et garde l'ancienne
-- valeur ici pour la restauration.
ALTER TABLE deals ADD COLUMN IF NOT EXISTS deleted_show_on_website BOOLEAN;

-- ---------------------------------------------
-- 2. L'app ne voit que les lignes actives
-- ---------------------------------------------
-- Remplace les politiques SELECT par « propriétaire ET non archivé ».
-- Le connecteur MCP (clé service) voit tout, archives comprises.
DO $$
DECLARE
  t TEXT;
  p RECORD;
BEGIN
  FOREACH t IN ARRAY ARRAY['venues','contacts','deals','tasks','activities','tours','tour_stops','tour_expenses','templates']
  LOOP
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND cmd = 'SELECT'
    LOOP
      EXECUTE format('DROP POLICY %I ON %I', p.policyname, t);
    END LOOP;
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT USING (auth.uid() = user_id AND deleted_at IS NULL)',
      'Users can view own active ' || t, t
    );
  END LOOP;
END $$;

-- ---------------------------------------------
-- 3. updated_at manquants
-- ---------------------------------------------
ALTER TABLE activities ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE tour_expenses ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
DROP TRIGGER IF EXISTS update_activities_updated_at ON activities;
CREATE TRIGGER update_activities_updated_at BEFORE UPDATE ON activities FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_tour_expenses_updated_at ON tour_expenses;
CREATE TRIGGER update_tour_expenses_updated_at BEFORE UPDATE ON tour_expenses FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
-- Tâches : la table a la colonne mais peut-être pas le trigger.
DROP TRIGGER IF EXISTS update_tasks_updated_at ON tasks;
CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------
-- 4. Activités : nouveaux types + canal
-- ---------------------------------------------
ALTER TABLE activities DROP CONSTRAINT IF EXISTS activities_type_check;
ALTER TABLE activities ADD CONSTRAINT activities_type_check
  CHECK (type IN ('email_sent','reply_received','status_change','note','concert_played','relance','call','message'));

ALTER TABLE activities ADD COLUMN IF NOT EXISTS channel TEXT;
ALTER TABLE activities DROP CONSTRAINT IF EXISTS activities_channel_check;
ALTER TABLE activities ADD CONSTRAINT activities_channel_check
  CHECK (channel IS NULL OR channel IN ('sms','phone','email','website_form','facebook','instagram','whatsapp','linkedin','in_person','other'));

-- ---------------------------------------------
-- 5. Date de relance
-- ---------------------------------------------
-- Avant : à chaque mise à jour d'une opportunité « contacté »/« relancé »,
-- next_relance_at était recalculée (dernier message + 7 j), ce qui écrasait
-- une date choisie à la main (snooze du mode Focus, set_follow_up).
-- Désormais, le calcul automatique n'a lieu qu'à la création, quand l'étape
-- ou la date du dernier message change — et jamais si la date de relance
-- est modifiée explicitement dans la même requête.
CREATE OR REPLACE FUNCTION calculate_next_relance()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.stage IN ('confirme', 'termine', 'refuse') THEN
    NEW.next_relance_at = NULL;
  ELSIF TG_OP = 'UPDATE' AND NEW.next_relance_at IS DISTINCT FROM OLD.next_relance_at THEN
    NULL; -- date fixée explicitement : on la garde
  ELSIF NEW.stage IN ('contacte', 'relance') AND NEW.last_message_at IS NOT NULL
    AND (TG_OP = 'INSERT'
         OR NEW.stage IS DISTINCT FROM OLD.stage
         OR NEW.last_message_at IS DISTINCT FROM OLD.last_message_at) THEN
    NEW.next_relance_at = NEW.last_message_at + INTERVAL '7 days';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------
-- 6. Journal d'audit
-- ---------------------------------------------
CREATE TABLE IF NOT EXISTS mcp_audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor TEXT NOT NULL,          -- ex. "claude.ai (OAuth : Claude)" ou "radar (URL secrète)"
  tool TEXT NOT NULL,           -- outil MCP appelé
  action TEXT NOT NULL,         -- create | update | archive | restore
  entity TEXT NOT NULL,         -- venue, contact, deal…
  entity_id UUID,
  before JSONB,
  after JSONB
);
CREATE INDEX IF NOT EXISTS idx_mcp_audit_user_created ON mcp_audit_log (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mcp_audit_entity ON mcp_audit_log (entity_id);
ALTER TABLE mcp_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own audit log" ON mcp_audit_log;
CREATE POLICY "Users can view own audit log" ON mcp_audit_log FOR SELECT USING (auth.uid() = user_id);

-- ---------------------------------------------
-- 7. OAuth 2.1
-- ---------------------------------------------
-- Accessibles uniquement par le serveur (clé service) : RLS activée sans
-- aucune politique, donc illisibles avec la clé publique.
-- Les secrets ne sont jamais stockés en clair, seulement leur SHA-256.
CREATE TABLE IF NOT EXISTS oauth_clients (
  client_id TEXT PRIMARY KEY,
  client_secret_hash TEXT,
  client_name TEXT NOT NULL DEFAULT '',
  redirect_uris TEXT[] NOT NULL,
  token_endpoint_auth_method TEXT NOT NULL DEFAULT 'none',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS oauth_codes (
  code_hash TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  redirect_uri TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT '',
  resource TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS oauth_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  family_id UUID NOT NULL,          -- même valeur pour toute la chaîne de renouvellements
  client_id TEXT NOT NULL REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
  client_name TEXT NOT NULL DEFAULT '',
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope TEXT NOT NULL DEFAULT '',
  access_hash TEXT NOT NULL UNIQUE,
  refresh_hash TEXT NOT NULL UNIQUE,
  access_expires_at TIMESTAMPTZ NOT NULL,
  refresh_expires_at TIMESTAMPTZ NOT NULL,
  rotated_at TIMESTAMPTZ,           -- refresh token déjà échangé
  revoked_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_family ON oauth_tokens (family_id);
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_user ON oauth_tokens (user_id);

ALTER TABLE oauth_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_tokens ENABLE ROW LEVEL SECURITY;
