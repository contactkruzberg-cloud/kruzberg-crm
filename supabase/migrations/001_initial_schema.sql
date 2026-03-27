-- =============================================
-- KRUZBERG CRM - Complete Database Schema
-- =============================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- VENUES TABLE
-- =============================================
CREATE TABLE venues (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'bar' CHECK (type IN ('bar','salle','festival','cafe_concert','mjc','other')),
  city TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT 'France',
  capacity INTEGER,
  email TEXT,
  phone TEXT,
  instagram TEXT,
  website TEXT,
  fit_score INTEGER NOT NULL DEFAULT 3 CHECK (fit_score >= 1 AND fit_score <= 5),
  cover_image_url TEXT,
  notes TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_venues_user_id ON venues(user_id);
CREATE INDEX idx_venues_city ON venues(city);
CREATE INDEX idx_venues_type ON venues(type);

-- =============================================
-- CONTACTS TABLE
-- =============================================
CREATE TABLE contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  venue_id UUID REFERENCES venues(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  role TEXT,
  email TEXT,
  phone TEXT,
  pref_method TEXT NOT NULL DEFAULT 'email' CHECK (pref_method IN ('email','phone','instagram','other')),
  tone TEXT NOT NULL DEFAULT 'vous' CHECK (tone IN ('tu','vous')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_contacts_user_id ON contacts(user_id);
CREATE INDEX idx_contacts_venue_id ON contacts(venue_id);

-- =============================================
-- DEALS TABLE
-- =============================================
CREATE TABLE deals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  stage TEXT NOT NULL DEFAULT 'a_contacter' CHECK (stage IN ('a_contacter','contacte','relance','repondu','confirme','refuse')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high')),
  first_contact_at TIMESTAMPTZ,
  last_message_at TIMESTAMPTZ,
  next_relance_at TIMESTAMPTZ,
  response TEXT,
  concert_date DATE,
  fee NUMERIC(10,2),
  notes TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_deals_user_id ON deals(user_id);
CREATE INDEX idx_deals_venue_id ON deals(venue_id);
CREATE INDEX idx_deals_stage ON deals(stage);
CREATE INDEX idx_deals_next_relance ON deals(next_relance_at);
CREATE INDEX idx_deals_concert_date ON deals(concert_date);

-- =============================================
-- ACTIVITIES TABLE
-- =============================================
CREATE TABLE activities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  deal_id UUID REFERENCES deals(id) ON DELETE CASCADE,
  venue_id UUID REFERENCES venues(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('email_sent','reply_received','status_change','note','concert_played')),
  content TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_activities_user_id ON activities(user_id);
CREATE INDEX idx_activities_deal_id ON activities(deal_id);
CREATE INDEX idx_activities_created_at ON activities(created_at DESC);

-- =============================================
-- TEMPLATES TABLE
-- =============================================
CREATE TABLE templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'first_contact' CHECK (category IN ('first_contact','relance_1','relance_2','confirmation','post_show')),
  subject TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_templates_user_id ON templates(user_id);

-- =============================================
-- TEMPLATE_SENDS TABLE
-- =============================================
CREATE TABLE template_sends (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  deal_id UUID REFERENCES deals(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  generated_body TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_template_sends_user_id ON template_sends(user_id);
CREATE INDEX idx_template_sends_template_id ON template_sends(template_id);

-- =============================================
-- UPDATED_AT TRIGGER FUNCTION
-- =============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
CREATE TRIGGER update_venues_updated_at BEFORE UPDATE ON venues FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_contacts_updated_at BEFORE UPDATE ON contacts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_deals_updated_at BEFORE UPDATE ON deals FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_templates_updated_at BEFORE UPDATE ON templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- AUTO-CALCULATE NEXT RELANCE DATE
-- =============================================
CREATE OR REPLACE FUNCTION calculate_next_relance()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.stage IN ('contacte', 'relance') AND NEW.last_message_at IS NOT NULL THEN
    NEW.next_relance_at = NEW.last_message_at + INTERVAL '7 days';
  ELSIF NEW.stage IN ('confirme', 'refuse') THEN
    NEW.next_relance_at = NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER auto_next_relance BEFORE INSERT OR UPDATE ON deals FOR EACH ROW EXECUTE FUNCTION calculate_next_relance();

-- =============================================
-- ACTIVITY LOG ON DEAL STAGE CHANGE
-- =============================================
CREATE OR REPLACE FUNCTION log_deal_stage_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.stage IS DISTINCT FROM NEW.stage THEN
    INSERT INTO activities (user_id, deal_id, venue_id, contact_id, type, content)
    VALUES (
      NEW.user_id,
      NEW.id,
      NEW.venue_id,
      NEW.contact_id,
      'status_change',
      'Stage changed from ' || COALESCE(OLD.stage, 'none') || ' to ' || NEW.stage
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER deal_stage_change_log AFTER UPDATE ON deals FOR EACH ROW EXECUTE FUNCTION log_deal_stage_change();

-- =============================================
-- ROW LEVEL SECURITY
-- =============================================
ALTER TABLE venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE template_sends ENABLE ROW LEVEL SECURITY;

-- Venues policies
CREATE POLICY "Users can view own venues" ON venues FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own venues" ON venues FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own venues" ON venues FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own venues" ON venues FOR DELETE USING (auth.uid() = user_id);

-- Contacts policies
CREATE POLICY "Users can view own contacts" ON contacts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own contacts" ON contacts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own contacts" ON contacts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own contacts" ON contacts FOR DELETE USING (auth.uid() = user_id);

-- Deals policies
CREATE POLICY "Users can view own deals" ON deals FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own deals" ON deals FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own deals" ON deals FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own deals" ON deals FOR DELETE USING (auth.uid() = user_id);

-- Activities policies
CREATE POLICY "Users can view own activities" ON activities FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own activities" ON activities FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own activities" ON activities FOR DELETE USING (auth.uid() = user_id);

-- Templates policies
CREATE POLICY "Users can view own templates" ON templates FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own templates" ON templates FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own templates" ON templates FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own templates" ON templates FOR DELETE USING (auth.uid() = user_id);

-- Template sends policies
CREATE POLICY "Users can view own sends" ON template_sends FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own sends" ON template_sends FOR INSERT WITH CHECK (auth.uid() = user_id);

-- =============================================
-- ENABLE REALTIME
-- =============================================
ALTER PUBLICATION supabase_realtime ADD TABLE deals;
ALTER PUBLICATION supabase_realtime ADD TABLE activities;
