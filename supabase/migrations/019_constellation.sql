-- =============================================
-- Constellation intégrée au CRM
-- =============================================
-- La carte des noms qui reviennent dans la niche post-punk (groupes explorés,
-- faits sourcés, fusions d'acteurs, file des recherches) quitte l'outil local
-- pour vivre ici. Même modèle « document » que radar_docs : une ligne par
-- document (collection + id), contenu en JSON, version incrémentée à chaque
-- écriture.
-- Collections : bands (un document par groupe), findings (un document par
-- groupe : la liste de ses faits), overrides (réglages par acteur), watch
-- (acteurs notés en séance), jobs (file des recherches), config (synthèse,
-- dernier lancement de la routine).
-- Idempotent.

CREATE TABLE IF NOT EXISTS constellation_docs (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  collection TEXT NOT NULL CHECK (collection IN ('bands', 'findings', 'overrides', 'watch', 'jobs', 'config')),
  id TEXT NOT NULL CHECK (id ~ '^[A-Za-z0-9_.~:@+-]{1,200}$'),
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, collection, id)
);

CREATE OR REPLACE FUNCTION constellation_docs_bump()
RETURNS TRIGGER AS $$
BEGIN
  NEW.version = OLD.version + 1;
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS constellation_docs_bump ON constellation_docs;
CREATE TRIGGER constellation_docs_bump BEFORE UPDATE ON constellation_docs FOR EACH ROW EXECUTE FUNCTION constellation_docs_bump();

-- Lu et écrit par le serveur du CRM (clé service, filtré sur le propriétaire) ;
-- les politiques couvrent un accès direct avec la session.
ALTER TABLE constellation_docs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own constellation docs" ON constellation_docs;
CREATE POLICY "Users can view own constellation docs" ON constellation_docs FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own constellation docs" ON constellation_docs;
CREATE POLICY "Users can insert own constellation docs" ON constellation_docs FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own constellation docs" ON constellation_docs;
CREATE POLICY "Users can update own constellation docs" ON constellation_docs FOR UPDATE USING (auth.uid() = user_id);
-- Pas de DELETE : une nouvelle exploration réécrit le document du groupe.
