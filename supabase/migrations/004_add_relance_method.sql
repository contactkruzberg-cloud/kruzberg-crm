-- =============================================
-- Add last_relance_method to deals
-- =============================================
-- Tracks how the last follow-up was made (SMS, phone, email, social, etc.)

ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS last_relance_method TEXT
  CHECK (last_relance_method IN (
    'sms',
    'phone',
    'email',
    'website_form',
    'facebook',
    'instagram',
    'whatsapp',
    'linkedin',
    'in_person',
    'other'
  ));
