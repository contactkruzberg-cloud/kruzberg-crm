-- =============================================
-- Add daily vehicle rental cost to tours
-- =============================================
-- Daily rental price of the utility vehicle (van). Multiplied by the number
-- of tour days in the budget computation (client-side).

ALTER TABLE tours
  ADD COLUMN IF NOT EXISTS vehicle_daily_cost NUMERIC(10,2) NOT NULL DEFAULT 0;
