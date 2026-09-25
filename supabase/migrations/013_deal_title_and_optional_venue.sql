-- =============================================
-- Named opportunities + venue OR contact
-- =============================================
-- Several opportunities can target the same venue (première partie,
-- candidature spontanée en headline, festival…), so a deal gets its own
-- optional name. When empty, the app falls back to the venue / contact name.
--
-- A deal no longer has to be tied to a venue: it must be tied to a venue
-- OR a contact (e.g. a programmer who books several places).
-- Idempotent: safe to run more than once.

ALTER TABLE deals ADD COLUMN IF NOT EXISTS title TEXT;

ALTER TABLE deals ALTER COLUMN venue_id DROP NOT NULL;

ALTER TABLE deals DROP CONSTRAINT IF EXISTS deals_venue_or_contact_check;
ALTER TABLE deals ADD CONSTRAINT deals_venue_or_contact_check
  CHECK (venue_id IS NOT NULL OR contact_id IS NOT NULL);

-- deals.contact_id is ON DELETE SET NULL: deleting the only contact of a
-- venue-less deal would break the check above and block the deletion.
-- Mirror the venue behaviour (ON DELETE CASCADE) and delete those deals.
CREATE OR REPLACE FUNCTION delete_contact_only_deals()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM deals WHERE contact_id = OLD.id AND venue_id IS NULL;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS delete_contact_only_deals ON contacts;
CREATE TRIGGER delete_contact_only_deals
  BEFORE DELETE ON contacts
  FOR EACH ROW EXECUTE FUNCTION delete_contact_only_deals();
