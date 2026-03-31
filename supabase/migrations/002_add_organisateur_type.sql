-- Add 'organisateur' to venue type constraint
ALTER TABLE venues DROP CONSTRAINT IF EXISTS venues_type_check;
ALTER TABLE venues ADD CONSTRAINT venues_type_check
  CHECK (type IN ('bar','salle','festival','cafe_concert','mjc','organisateur','other'));
