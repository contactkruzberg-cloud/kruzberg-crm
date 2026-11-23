-- =============================================
-- Messagerie : tous les mails de booking@ dans le CRM
-- =============================================
-- Copie locale des mails reçus et envoyés (boîte de réception, envoyés,
-- archives), synchronisée depuis le serveur IMAP d'OVH. Le rattachement à un
-- lieu, un contact ou une opportunité se fait à la lecture, par les adresses
-- des correspondants (peers) et leur nom de domaine (peer_domains) : ajouter
-- un contact fait apparaître tout son historique sans resynchroniser.
-- Idempotent : peut être relancé sans risque.

CREATE TABLE IF NOT EXISTS emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Identité du message (Message-ID, ou dossier/uid à défaut) : un mail rangé
  -- dans deux dossiers n'apparaît qu'une fois.
  message_key TEXT NOT NULL,
  message_id TEXT,
  folder TEXT NOT NULL,
  uid BIGINT,
  direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  from_addr TEXT NOT NULL DEFAULT '',
  from_name TEXT,
  to_addrs TEXT[] NOT NULL DEFAULT '{}',
  cc_addrs TEXT[] NOT NULL DEFAULT '{}',
  -- Correspondants (tout le monde sauf nous) et leurs domaines.
  peers TEXT[] NOT NULL DEFAULT '{}',
  peer_domains TEXT[] NOT NULL DEFAULT '{}',
  subject TEXT NOT NULL DEFAULT '',
  sent_at TIMESTAMPTZ NOT NULL,
  -- Texte écrit dans ce message (citations retirées) et le texte complet.
  body_text TEXT NOT NULL DEFAULT '',
  full_text TEXT,
  in_reply_to TEXT,
  refs TEXT,
  has_attachments BOOLEAN NOT NULL DEFAULT FALSE,
  seen BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, message_key)
);

CREATE INDEX IF NOT EXISTS idx_emails_user_sent ON emails(user_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_emails_peers ON emails USING GIN (peers);
CREATE INDEX IF NOT EXISTS idx_emails_peer_domains ON emails USING GIN (peer_domains);

ALTER TABLE emails ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own emails" ON emails;
CREATE POLICY "Users can view own emails" ON emails FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own emails" ON emails;
CREATE POLICY "Users can insert own emails" ON emails FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own emails" ON emails;
CREATE POLICY "Users can update own emails" ON emails FOR UPDATE USING (auth.uid() = user_id);

-- Où en est la synchro de chaque dossier (dernier uid lu).
CREATE TABLE IF NOT EXISTS email_sync_state (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  folder TEXT NOT NULL,
  uid_validity TEXT,
  last_uid BIGINT NOT NULL DEFAULT 0,
  done BOOLEAN NOT NULL DEFAULT FALSE,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, folder)
);

ALTER TABLE email_sync_state ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own sync state" ON email_sync_state;
CREATE POLICY "Users can view own sync state" ON email_sync_state FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own sync state" ON email_sync_state;
CREATE POLICY "Users can insert own sync state" ON email_sync_state FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own sync state" ON email_sync_state;
CREATE POLICY "Users can update own sync state" ON email_sync_state FOR UPDATE USING (auth.uid() = user_id);
