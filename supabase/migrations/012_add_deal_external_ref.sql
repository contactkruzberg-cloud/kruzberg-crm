-- =============================================
-- External reference on deals (connecteur MCP / Booking Radar)
-- =============================================
-- Lets an external tool (the KRUZBERG Booking Radar, via the MCP connector)
-- anchor a deal to its own id, so "Add to pipeline" is idempotent:
-- the same radar lead (external_source = 'radar', external_id = 'sp-013')
-- always maps to the same deal.
-- Idempotent: safe to run more than once.

ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS external_source TEXT,
  ADD COLUMN IF NOT EXISTS external_id TEXT;

-- One deal per (owner, source, external id). Partial: manual deals keep NULLs.
CREATE UNIQUE INDEX IF NOT EXISTS idx_deals_external_ref
  ON deals (user_id, external_source, external_id)
  WHERE external_id IS NOT NULL;

-- The 'media' venue type exists in the app (src/types/database.ts) but no
-- migration ever added it to the CHECK constraint. The radar creates 'media'
-- venues for press leads, so make sure the constraint allows it.
ALTER TABLE venues DROP CONSTRAINT IF EXISTS venues_type_check;
ALTER TABLE venues ADD CONSTRAINT venues_type_check
  CHECK (type IN ('bar','salle','festival','cafe_concert','mjc','organisateur','media','other'));
