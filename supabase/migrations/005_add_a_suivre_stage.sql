-- =============================================
-- Add "a_suivre" deal stage
-- =============================================
-- Tracks deals where the contact replied positively but hasn't proposed a date yet.
-- Positioned in pipeline between "repondu" and "confirme".

ALTER TABLE deals DROP CONSTRAINT IF EXISTS deals_stage_check;

ALTER TABLE deals
  ADD CONSTRAINT deals_stage_check
  CHECK (stage IN (
    'a_contacter',
    'contacte',
    'relance',
    'repondu',
    'a_suivre',
    'confirme',
    'refuse'
  ));
