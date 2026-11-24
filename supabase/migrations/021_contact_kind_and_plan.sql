-- =============================================
-- 1. Fonction des contacts  2. Plan de route (objectifs, KPI, rétroplanning)
-- =============================================
-- Idempotent : peut être relancé sans risque.

-- 1. Qui est qui : programmateur·rice, promoteur local, booker, manager…
-- (l'intitulé libre reste dans contacts.role).
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS kind TEXT;
ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_kind_check;
ALTER TABLE contacts ADD CONSTRAINT contacts_kind_check CHECK (kind IS NULL OR kind IN (
  'programmateur','promoteur','organisateur','booker','tourneur','manager','direction',
  'label','media','accompagnement','technique','artiste','autre'));

-- 2a. Objectifs chiffrés de la saison. metric = 'manual' (relevés saisis à la
-- main : auditeurs Spotify, abonnés…) ou un indicateur calculé par le CRM
-- ('auto:dates_jouees', 'auto:dates_confirmees', 'auto:taux_reponse'…).
CREATE TABLE IF NOT EXISTS plan_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  axis TEXT NOT NULL DEFAULT 'live',
  title TEXT NOT NULL,
  metric TEXT NOT NULL DEFAULT 'manual',
  unit TEXT,
  baseline NUMERIC NOT NULL DEFAULT 0,
  target NUMERIC NOT NULL DEFAULT 0,
  start_date DATE,
  deadline DATE,
  notes TEXT,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Relevés successifs d'un objectif manuel (la courbe de progression).
CREATE TABLE IF NOT EXISTS plan_readings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  goal_id UUID NOT NULL REFERENCES plan_goals(id) ON DELETE CASCADE,
  value NUMERIC NOT NULL,
  measured_at DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2b. Projets avec une date cible (sortie d'EP, tournée, candidature…).
CREATE TABLE IF NOT EXISTS plan_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  template TEXT,
  target_date DATE NOT NULL,
  notes TEXT,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Étapes du rétroplanning, placées par rapport à la date cible
-- (offset_days = -60 : deux mois avant). Déplacer la date cible déplace tout.
CREATE TABLE IF NOT EXISTS plan_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES plan_projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  phase TEXT,
  offset_days INTEGER NOT NULL DEFAULT 0,
  done_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_plan_readings_goal ON plan_readings(goal_id, measured_at);
CREATE INDEX IF NOT EXISTS idx_plan_steps_project ON plan_steps(project_id);

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['plan_goals','plan_readings','plan_projects','plan_steps'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "own rows" ON %I', t);
    EXECUTE format('CREATE POLICY "own rows" ON %I FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)', t);
  END LOOP;
END $$;
