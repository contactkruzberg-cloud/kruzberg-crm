-- =============================================
-- Preserve activities when their deal is deleted
-- =============================================
-- Changes activities.deal_id foreign key from ON DELETE CASCADE to ON DELETE SET NULL.
-- After this migration, deleting a deal nullifies activities.deal_id but keeps the
-- activity row (still linked to the venue/contact). This allows the conversation,
-- notes, and relance history to remain accessible from the venue page even after
-- the opportunity is removed from the pipeline.

ALTER TABLE activities DROP CONSTRAINT IF EXISTS activities_deal_id_fkey;

ALTER TABLE activities
  ADD CONSTRAINT activities_deal_id_fkey
  FOREIGN KEY (deal_id) REFERENCES deals(id) ON DELETE SET NULL;
