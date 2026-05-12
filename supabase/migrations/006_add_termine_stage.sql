-- =============================================
-- Add "termine" deal stage
-- =============================================
-- For concerts that have already been played.
-- Positioned in pipeline between "confirme" and "refuse".

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
    'termine',
    'refuse'
  ));

-- Stop computing next_relance_at for terminé deals (terminal stage)
CREATE OR REPLACE FUNCTION calculate_next_relance()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.stage IN ('contacte', 'relance') AND NEW.last_message_at IS NOT NULL THEN
    NEW.next_relance_at = NEW.last_message_at + INTERVAL '7 days';
  ELSIF NEW.stage IN ('confirme', 'termine', 'refuse') THEN
    NEW.next_relance_at = NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
