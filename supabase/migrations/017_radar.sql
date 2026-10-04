-- =============================================
-- Booking Radar intégré au CRM
-- =============================================
-- Le radar (pistes de la veille quotidienne, réglages, journal, file de
-- brouillons) quitte la base de l'artifact claude.ai pour vivre ici.
-- Stockage « document » volontairement simple et fidèle à l'ancienne base :
-- une ligne par document (collection + id), contenu en JSON, numéro de
-- version incrémenté à chaque écriture (écritures conditionnelles).
-- Collections : leads, config (scope, meta), runs, outbox.
-- Idempotent.

CREATE TABLE IF NOT EXISTS radar_docs (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  collection TEXT NOT NULL CHECK (collection IN ('leads', 'config', 'runs', 'outbox')),
  id TEXT NOT NULL CHECK (id ~ '^[A-Za-z0-9_.~:@+-]{1,200}$'),
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, collection, id)
);

CREATE OR REPLACE FUNCTION radar_docs_bump()
RETURNS TRIGGER AS $$
BEGIN
  NEW.version = OLD.version + 1;
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS radar_docs_bump ON radar_docs;
CREATE TRIGGER radar_docs_bump BEFORE UPDATE ON radar_docs FOR EACH ROW EXECUTE FUNCTION radar_docs_bump();

ALTER TABLE radar_docs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own radar docs" ON radar_docs;
CREATE POLICY "Users can view own radar docs" ON radar_docs FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own radar docs" ON radar_docs;
CREATE POLICY "Users can insert own radar docs" ON radar_docs FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own radar docs" ON radar_docs;
CREATE POLICY "Users can update own radar docs" ON radar_docs FOR UPDATE USING (auth.uid() = user_id);
-- Pas de DELETE : une piste n'est jamais effacée, elle est « écartée » (dismissed).

-- ---------------------------------------------
-- Synchronisation avec l'artifact claude.ai (dans les deux sens)
-- ---------------------------------------------
-- Pour chaque document : dernier état fusionné (base), version vue dans
-- l'artifact et dans le CRM au moment de la synchro. Une tâche horaire
-- compare les versions, le CRM fusionne champ par champ (3 voies) et
-- renvoie les écritures à appliquer à l'artifact ; « pending » attend la
-- confirmation que l'artifact les a bien reçues.
CREATE TABLE IF NOT EXISTS radar_sync (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  collection TEXT NOT NULL,
  id TEXT NOT NULL,
  base JSONB NOT NULL DEFAULT '{}'::jsonb,
  artifact_version INTEGER,          -- NULL : à adopter au prochain passage (état initial = import)
  crm_version INTEGER,
  pending JSONB,                     -- {base, crm_version} en attente d'accusé de réception
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, collection, id)
);
ALTER TABLE radar_sync ENABLE ROW LEVEL SECURITY;
-- Utilisée uniquement par le serveur (clé service) : aucune politique.
