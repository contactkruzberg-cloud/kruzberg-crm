-- =============================================
-- TOURS MODULE
-- =============================================
-- Adds tour planning: a tour groups several concert dates (stops) organised
-- geographically and in time, with logistics (hotels, schedule), budget
-- (fees vs fuel/hotels/per-diems) and a printable road book.
-- A stop can reference an existing confirmed deal (stays in sync with the
-- pipeline) or be a free stop (day off / travel day).

-- =============================================
-- TOURS TABLE
-- =============================================
CREATE TABLE tours (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'brouillon' CHECK (status IN ('brouillon','confirmee','terminee','annulee')),
  start_date DATE,
  end_date DATE,
  members_count INTEGER NOT NULL DEFAULT 4,
  vehicle_label TEXT,
  fuel_consumption NUMERIC(5,2) NOT NULL DEFAULT 8,   -- L / 100 km
  fuel_price NUMERIC(5,2) NOT NULL DEFAULT 1.8,       -- € / L
  per_diem NUMERIC(10,2) NOT NULL DEFAULT 0,          -- € / person / day
  road_factor NUMERIC(4,2) NOT NULL DEFAULT 1.3,      -- road km ≈ as-the-crow-flies × factor
  color TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tours_user_id ON tours(user_id);
CREATE INDEX idx_tours_start_date ON tours(start_date);

-- =============================================
-- TOUR_STOPS TABLE (one row = one day of the tour)
-- =============================================
CREATE TABLE tour_stops (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tour_id UUID NOT NULL REFERENCES tours(id) ON DELETE CASCADE,
  deal_id UUID REFERENCES deals(id) ON DELETE SET NULL,
  venue_id UUID REFERENCES venues(id) ON DELETE SET NULL,
  stop_date DATE NOT NULL,
  type TEXT NOT NULL DEFAULT 'show' CHECK (type IN ('show','day_off','travel')),
  order_index INTEGER NOT NULL DEFAULT 0,
  fee NUMERIC(10,2),
  -- Denormalised location so a free stop works without a venue
  city TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  -- Day schedule (HH:MM)
  arrival_time TEXT,
  load_in_time TEXT,
  soundcheck_time TEXT,
  doors_time TEXT,
  set_time TEXT,
  -- Accommodation
  hotel_name TEXT,
  hotel_address TEXT,
  hotel_cost NUMERIC(10,2),
  hotel_rooms INTEGER,
  hotel_booked BOOLEAN NOT NULL DEFAULT false,
  -- On-site contact
  on_site_contact TEXT,
  on_site_phone TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tour_stops_user_id ON tour_stops(user_id);
CREATE INDEX idx_tour_stops_tour_id ON tour_stops(tour_id);
CREATE INDEX idx_tour_stops_tour_order ON tour_stops(tour_id, order_index);
CREATE INDEX idx_tour_stops_deal_id ON tour_stops(deal_id);

-- =============================================
-- TOUR_EXPENSES TABLE (one-off costs beyond auto-computed fuel/hotels)
-- =============================================
CREATE TABLE tour_expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tour_id UUID NOT NULL REFERENCES tours(id) ON DELETE CASCADE,
  stop_id UUID REFERENCES tour_stops(id) ON DELETE CASCADE,
  category TEXT NOT NULL DEFAULT 'misc' CHECK (category IN ('fuel','toll','hotel','food','per_diem','transport','misc')),
  label TEXT NOT NULL DEFAULT '',
  amount NUMERIC(10,2) NOT NULL,
  expense_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tour_expenses_user_id ON tour_expenses(user_id);
CREATE INDEX idx_tour_expenses_tour_id ON tour_expenses(tour_id);

-- =============================================
-- UPDATED_AT TRIGGERS (function already defined in 001)
-- =============================================
CREATE TRIGGER update_tours_updated_at BEFORE UPDATE ON tours FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_tour_stops_updated_at BEFORE UPDATE ON tour_stops FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- ROW LEVEL SECURITY
-- =============================================
ALTER TABLE tours ENABLE ROW LEVEL SECURITY;
ALTER TABLE tour_stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE tour_expenses ENABLE ROW LEVEL SECURITY;

-- Tours policies
CREATE POLICY "Users can view own tours" ON tours FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own tours" ON tours FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own tours" ON tours FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own tours" ON tours FOR DELETE USING (auth.uid() = user_id);

-- Tour stops policies
CREATE POLICY "Users can view own tour_stops" ON tour_stops FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own tour_stops" ON tour_stops FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own tour_stops" ON tour_stops FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own tour_stops" ON tour_stops FOR DELETE USING (auth.uid() = user_id);

-- Tour expenses policies
CREATE POLICY "Users can view own tour_expenses" ON tour_expenses FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own tour_expenses" ON tour_expenses FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own tour_expenses" ON tour_expenses FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own tour_expenses" ON tour_expenses FOR DELETE USING (auth.uid() = user_id);

-- =============================================
-- ENABLE REALTIME
-- =============================================
ALTER PUBLICATION supabase_realtime ADD TABLE tours;
ALTER PUBLICATION supabase_realtime ADD TABLE tour_stops;
