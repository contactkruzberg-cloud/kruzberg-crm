-- =============================================
-- Add precise address fields to venues
-- =============================================
-- Adds nullable `address` (street + number) and `postal_code` columns so
-- venues can carry a full postal address in addition to city/country.
-- These are used in the venue forms and for geocoding (lat/lng already exist).

ALTER TABLE venues
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS postal_code TEXT;
