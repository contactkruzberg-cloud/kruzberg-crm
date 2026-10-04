-- =============================================
-- Prospection : échéances, qualification des lieux, groupes amis, briefings
-- =============================================
-- 1. Structures : période de candidature annuelle (festivals, tremplins…)
--    et qualification (style, groupes similaires, délai de programmation,
--    « ne pas recontacter avant »).
-- 2. Groupes amis (plateaux partagés, échanges de dates) + lien avec les
--    opportunités (qui joue avec nous sur quelle date).
-- 3. Briefings hebdomadaires de prospection, écrits par Claude via le
--    connecteur MCP et affichés sur le tableau de bord.
-- Idempotent : peut être relancée sans risque.

-- ---------------------------------------------
-- 1. Structures
-- ---------------------------------------------
-- Dates annuelles au format MM-DD (ex. '01-15' = 15 janvier), l'année
-- n'étant pas pertinente : le CRM calcule la prochaine occurrence.
ALTER TABLE venues
  ADD COLUMN IF NOT EXISTS application_opens TEXT,
  ADD COLUMN IF NOT EXISTS application_deadline TEXT,
  ADD COLUMN IF NOT EXISTS application_url TEXT,
  ADD COLUMN IF NOT EXISTS style_fit TEXT,
  ADD COLUMN IF NOT EXISTS similar_bands TEXT,
  ADD COLUMN IF NOT EXISTS booking_lead_months INTEGER,
  ADD COLUMN IF NOT EXISTS do_not_contact_until DATE;

ALTER TABLE venues DROP CONSTRAINT IF EXISTS venues_application_dates_check;
ALTER TABLE venues ADD CONSTRAINT venues_application_dates_check CHECK (
  (application_opens IS NULL OR application_opens ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$')
  AND (application_deadline IS NULL OR application_deadline ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$')
);
ALTER TABLE venues DROP CONSTRAINT IF EXISTS venues_style_fit_check;
ALTER TABLE venues ADD CONSTRAINT venues_style_fit_check CHECK (style_fit IS NULL OR style_fit IN ('yes','maybe','no'));
ALTER TABLE venues DROP CONSTRAINT IF EXISTS venues_booking_lead_check;
ALTER TABLE venues ADD CONSTRAINT venues_booking_lead_check CHECK (booking_lead_months IS NULL OR booking_lead_months BETWEEN 0 AND 24);

-- ---------------------------------------------
-- 2. Groupes amis
-- ---------------------------------------------
CREATE TABLE IF NOT EXISTS bands (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  city TEXT,
  genre TEXT,
  contact_name TEXT,
  email TEXT,
  phone TEXT,
  instagram TEXT,
  website TEXT,
  -- Échange de dates : 'we_owe' = on leur doit une date chez nous,
  -- 'they_owe' = ils nous doivent une date chez eux.
  exchange_status TEXT NOT NULL DEFAULT 'none' CHECK (exchange_status IN ('none','we_owe','they_owe')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  deleted_batch UUID
);
CREATE INDEX IF NOT EXISTS idx_bands_user_id ON bands(user_id);
DROP TRIGGER IF EXISTS update_bands_updated_at ON bands;
CREATE TRIGGER update_bands_updated_at BEFORE UPDATE ON bands FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS deal_bands (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  band_id UUID NOT NULL REFERENCES bands(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'co_bill' CHECK (role IN ('headliner','support','co_bill')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Détacher un groupe via le connecteur MCP archive le lien (réversible).
  deleted_at TIMESTAMPTZ,
  UNIQUE (deal_id, band_id)
);
CREATE INDEX IF NOT EXISTS idx_deal_bands_band ON deal_bands(band_id);

ALTER TABLE bands ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_bands ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own active bands" ON bands;
CREATE POLICY "Users can view own active bands" ON bands FOR SELECT USING (auth.uid() = user_id AND deleted_at IS NULL);
DROP POLICY IF EXISTS "Users can insert own bands" ON bands;
CREATE POLICY "Users can insert own bands" ON bands FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own bands" ON bands;
CREATE POLICY "Users can update own bands" ON bands FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own bands" ON bands;
CREATE POLICY "Users can delete own bands" ON bands FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own deal_bands" ON deal_bands;
-- Pas de filtre deleted_at ici : un ré-ajout depuis l'app (upsert) doit pouvoir
-- « voir » un lien retiré via MCP pour le réactiver. L'app filtre elle-même.
CREATE POLICY "Users can view own deal_bands" ON deal_bands FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own deal_bands" ON deal_bands;
CREATE POLICY "Users can insert own deal_bands" ON deal_bands FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own deal_bands" ON deal_bands;
CREATE POLICY "Users can update own deal_bands" ON deal_bands FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own deal_bands" ON deal_bands;
CREATE POLICY "Users can delete own deal_bands" ON deal_bands FOR DELETE USING (auth.uid() = user_id);

-- ---------------------------------------------
-- 3. Briefings hebdomadaires
-- ---------------------------------------------
CREATE TABLE IF NOT EXISTS briefings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,      -- lundi de la semaine concernée
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '', -- Markdown simple
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, week_start)
);
DROP TRIGGER IF EXISTS update_briefings_updated_at ON briefings;
CREATE TRIGGER update_briefings_updated_at BEFORE UPDATE ON briefings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE briefings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own briefings" ON briefings;
CREATE POLICY "Users can view own briefings" ON briefings FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own briefings" ON briefings;
CREATE POLICY "Users can delete own briefings" ON briefings FOR DELETE USING (auth.uid() = user_id);
