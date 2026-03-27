-- =============================================
-- KRUZBERG CRM - Seed Data
-- Run this AFTER creating your first user account
-- Replace 'YOUR_USER_ID' with your actual user UUID
-- (find it in Supabase Dashboard → Authentication → Users)
-- =============================================

-- To use: go to Supabase Dashboard → SQL Editor, paste this,
-- replace YOUR_USER_ID, and run.

DO $$
DECLARE
  uid UUID := 'YOUR_USER_ID';  -- REPLACE THIS!
  v1 UUID; v2 UUID; v3 UUID; v4 UUID; v5 UUID;
  c1 UUID; c2 UUID; c3 UUID; c4 UUID; c5 UUID;
BEGIN

-- ===== VENUES =====
INSERT INTO venues (id, user_id, name, type, city, country, capacity, email, phone, instagram, fit_score, latitude, longitude, notes)
VALUES
  (gen_random_uuid(), uid, 'Le Petit Bain', 'salle', 'Paris', 'France', 450, 'booking@petitbain.org', '01 45 67 89 00', '@lepetitbain', 5, 48.8323, 2.3728, 'Super salle, bonne acoustique. Ont programmé des groupes similaires.')
RETURNING id INTO v1;

INSERT INTO venues (id, user_id, name, type, city, country, capacity, email, phone, instagram, fit_score, latitude, longitude, notes)
VALUES
  (gen_random_uuid(), uid, 'Le Sonic', 'bar', 'Lyon', 'France', 150, 'contact@lesonic.fr', '04 72 00 11 22', '@lesonoclyon', 4, 45.7640, 4.8357, 'Bar rock avec programmation régulière. Ambiance parfaite pour nous.')
RETURNING id INTO v2;

INSERT INTO venues (id, user_id, name, type, city, country, capacity, email, phone, instagram, fit_score, latitude, longitude, notes)
VALUES
  (gen_random_uuid(), uid, 'Hellfest Corner', 'festival', 'Clisson', 'France', 60000, 'bands@hellfest.fr', NULL, '@hellfestopenair', 5, 47.0863, -1.2817, 'Le graal. Envoyer candidature tremplin.')
RETURNING id INTO v3;

INSERT INTO venues (id, user_id, name, type, city, country, capacity, email, phone, instagram, fit_score, latitude, longitude, notes)
VALUES
  (gen_random_uuid(), uid, 'La Machine du Moulin Rouge', 'salle', 'Paris', 'France', 800, 'prog@lamachine.fr', '01 53 41 88 89', '@lamachinedumoulinrouge', 4, 48.8842, 2.3322, 'Programmation éclectique. Contact via booker externe.')
RETURNING id INTO v4;

INSERT INTO venues (id, user_id, name, type, city, country, capacity, email, phone, instagram, fit_score, latitude, longitude, notes)
VALUES
  (gen_random_uuid(), uid, 'Le Ferrailleur', 'salle', 'Nantes', 'France', 400, 'booking@ferrailleur.net', '02 40 35 12 34', '@leferrailleur', 3, 47.2067, -1.5571, 'Bonne salle. Un peu loin mais public rock fidèle.')
RETURNING id INTO v5;

-- ===== CONTACTS =====
INSERT INTO contacts (id, user_id, venue_id, name, role, email, phone, pref_method, tone, notes)
VALUES
  (gen_random_uuid(), uid, v1, 'Marie Lefèvre', 'Programmatrice', 'marie@petitbain.org', '06 12 34 56 78', 'email', 'vous', 'Répond vite, préfère les emails concis.')
RETURNING id INTO c1;

INSERT INTO contacts (id, user_id, venue_id, name, role, email, phone, pref_method, tone, notes)
VALUES
  (gen_random_uuid(), uid, v2, 'Julien Roche', 'Gérant', 'julien@lesonic.fr', '06 98 76 54 32', 'instagram', 'tu', 'Pote de pote. On peut le tutoyer.')
RETURNING id INTO c2;

INSERT INTO contacts (id, user_id, venue_id, name, role, email, phone, pref_method, tone, notes)
VALUES
  (gen_random_uuid(), uid, v3, 'Thomas Beaumont', 'Chargé programmation', 'thomas@hellfest.fr', NULL, 'email', 'vous', 'Très formel. Passer par le formulaire officiel aussi.')
RETURNING id INTO c3;

INSERT INTO contacts (id, user_id, venue_id, name, role, email, phone, pref_method, tone, notes)
VALUES
  (gen_random_uuid(), uid, v4, 'Sophie Chen', 'Booker externe', 'sophie@bookingagency.fr', '06 55 44 33 22', 'email', 'vous', 'Booker indépendante qui gère plusieurs salles parisiennes.')
RETURNING id INTO c4;

INSERT INTO contacts (id, user_id, venue_id, name, role, email, phone, pref_method, tone, notes)
VALUES
  (gen_random_uuid(), uid, v5, 'Maxime Durand', 'Programmateur', 'max@ferrailleur.net', '06 11 22 33 44', 'email', 'tu', NULL)
RETURNING id INTO c5;

-- ===== DEALS =====
-- Confirmé (with concert date)
INSERT INTO deals (user_id, venue_id, contact_id, stage, priority, first_contact_at, last_message_at, concert_date, fee, notes, tags)
VALUES (uid, v1, c1, 'confirme', 'high',
  NOW() - INTERVAL '45 days', NOW() - INTERVAL '10 days',
  (CURRENT_DATE + INTERVAL '30 days')::date, 300,
  'Concert confirmé ! Soundcheck à 17h. Backline fourni sauf guitares.',
  ARRAY['Paris', 'Salle', 'Priorité haute']);

-- Relancé (overdue relance)
INSERT INTO deals (user_id, venue_id, contact_id, stage, priority, first_contact_at, last_message_at, next_relance_at, notes, tags)
VALUES (uid, v2, c2, 'relance', 'high',
  NOW() - INTERVAL '21 days', NOW() - INTERVAL '14 days',
  NOW() - INTERVAL '3 days',
  'Premier mail envoyé via IG, relancé par email. Pas de réponse encore.',
  ARRAY['Lyon', 'Bar']);

-- Contacté (relance due soon)
INSERT INTO deals (user_id, venue_id, contact_id, stage, priority, first_contact_at, last_message_at, next_relance_at, notes, tags)
VALUES (uid, v3, c3, 'contacte', 'high',
  NOW() - INTERVAL '7 days', NOW() - INTERVAL '7 days',
  NOW() + INTERVAL '1 day',
  'Candidature tremplin envoyée. Croisons les doigts.',
  ARRAY['Festival', 'Priorité haute']);

-- Répondu
INSERT INTO deals (user_id, venue_id, contact_id, stage, priority, first_contact_at, last_message_at, response, notes, tags)
VALUES (uid, v4, c4, 'repondu', 'medium',
  NOW() - INTERVAL '30 days', NOW() - INTERVAL '5 days',
  'Intéressée mais pas de créneau avant septembre. Recontacter en juin.',
  'Sophie Chen est la bonne personne. A aimé notre dernier single.',
  ARRAY['Paris', 'Salle']);

-- À contacter
INSERT INTO deals (user_id, venue_id, contact_id, stage, priority, notes, tags)
VALUES (uid, v5, c5, 'a_contacter', 'low',
  'Repéré via Instagram. Programmation rock/metal régulière.',
  ARRAY['Nantes', 'Salle']);

-- Refusé
INSERT INTO deals (user_id, venue_id, contact_id, stage, priority, first_contact_at, last_message_at, response, notes, tags)
VALUES (uid, v2, c2, 'refuse', 'low',
  NOW() - INTERVAL '90 days', NOW() - INTERVAL '60 days',
  'Programmation complète jusqu''en décembre. Retenter plus tard.',
  'Ancien deal. Retenter dans 3 mois.',
  ARRAY['Lyon', 'Bar']);

-- More deals
INSERT INTO deals (user_id, venue_id, contact_id, stage, priority, first_contact_at, last_message_at, next_relance_at, notes, tags)
VALUES (uid, v1, c1, 'relance', 'medium',
  NOW() - INTERVAL '15 days', NOW() - INTERVAL '8 days',
  NOW() + INTERVAL '2 days',
  'Demande pour une deuxième date en automne.',
  ARRAY['Paris', 'Salle']);

INSERT INTO deals (user_id, venue_id, contact_id, stage, priority, first_contact_at, last_message_at, concert_date, fee, notes, tags)
VALUES (uid, v5, c5, 'confirme', 'medium',
  NOW() - INTERVAL '60 days', NOW() - INTERVAL '20 days',
  (CURRENT_DATE + INTERVAL '60 days')::date, 200,
  'Concert confirmé pour fin mai. First partie de Gojira tribute.',
  ARRAY['Nantes', 'Salle']);

INSERT INTO deals (user_id, venue_id, contact_id, stage, priority, first_contact_at, last_message_at, next_relance_at, tags)
VALUES (uid, v4, c4, 'contacte', 'medium',
  NOW() - INTERVAL '3 days', NOW() - INTERVAL '3 days',
  NOW() + INTERVAL '5 days',
  ARRAY['Paris', 'Salle']);

INSERT INTO deals (user_id, venue_id, contact_id, stage, priority, first_contact_at, last_message_at, next_relance_at, response, tags)
VALUES (uid, v3, c3, 'repondu', 'high',
  NOW() - INTERVAL '40 days', NOW() - INTERVAL '2 days',
  NULL,
  'Sélectionnés pour le 2ème tour du tremplin ! Attente résultat final.',
  ARRAY['Festival', 'Priorité haute']);

-- ===== TEMPLATES =====
INSERT INTO templates (user_id, name, category, subject, body)
VALUES
  (uid, 'Premier contact standard', 'first_contact',
   'KRUZBERG — Demande de date / {{nom_lieu}}',
   'Bonjour {{nom_contact}},

Je me permets de vous contacter au nom de KRUZBERG, groupe de rock/metal basé en région parisienne.

Nous cherchons activement des dates pour notre tournée 2026 et {{nom_lieu}} correspond parfaitement à ce que nous recherchons.

Notre dernier single "{{single}}" est sorti récemment et a été bien accueilli. Vous pouvez l''écouter ici : [lien]

Seriez-vous disponible pour en discuter ?

Bien cordialement,
KRUZBERG'),

  (uid, 'Relance douce', 'relance_1',
   'Re: KRUZBERG — Relance amicale',
   'Bonjour {{nom_contact}},

Je me permets de revenir vers vous suite à mon message du {{date_dernier_mail}}.

Je comprendrais parfaitement que vous soyez très sollicité(e), mais je souhaitais m''assurer que ma proposition n''était pas passée inaperçue.

N''hésitez pas à me faire un retour, même négatif — cela nous aide à avancer.

Merci pour votre temps,
KRUZBERG'),

  (uid, 'Relance ferme', 'relance_2',
   'KRUZBERG — Dernière relance',
   'Bonjour {{nom_contact}},

Je vous envoie un dernier message concernant notre demande de concert à {{nom_lieu}}.

Si ce n''est pas le bon moment, pas de souci — nous retentons plus tard. Mais si l''idée vous intéresse, nous sommes flexibles sur les dates.

En espérant avoir de vos nouvelles,
KRUZBERG'),

  (uid, 'Confirmation concert', 'confirmation',
   'Re: KRUZBERG — Confirmation de date',
   'Bonjour {{nom_contact}},

Merci beaucoup pour cette confirmation ! Nous sommes ravis de jouer à {{nom_lieu}}.

Pouvez-vous me confirmer les détails suivants :
- Heure de soundcheck
- Backline disponible
- Accès au parking / chargement
- Conditions techniques particulières

N''hésitez pas si vous avez besoin d''informations supplémentaires de notre côté.

À très bientôt,
KRUZBERG'),

  (uid, 'Remerciement post-concert', 'post_show',
   'KRUZBERG — Merci pour cette soirée !',
   'Bonjour {{nom_contact}},

Un grand merci pour l''accueil à {{nom_lieu}} ! Nous avons passé une super soirée et le public était génial.

On espère que le retour de votre côté est positif aussi. Si c''est le cas, nous serions ravis de revenir dès que possible.

Merci encore et à bientôt !
KRUZBERG');

-- ===== ACTIVITIES =====
INSERT INTO activities (user_id, venue_id, type, content)
VALUES
  (uid, v1, 'email_sent', 'Premier email envoyé au Petit Bain'),
  (uid, v1, 'reply_received', 'Réponse positive de Marie — créneau disponible'),
  (uid, v1, 'status_change', 'Stage changed from contacte to confirme'),
  (uid, v2, 'email_sent', 'Email de prise de contact envoyé au Sonic'),
  (uid, v2, 'email_sent', 'Relance envoyée au Sonic'),
  (uid, v3, 'email_sent', 'Candidature tremplin Hellfest envoyée'),
  (uid, v4, 'email_sent', 'Email envoyé à Sophie Chen pour La Machine'),
  (uid, v4, 'reply_received', 'Sophie intéressée mais pas de créneau avant septembre'),
  (uid, v5, 'note', 'Repéré Le Ferrailleur via Instagram — bonne prog rock'),
  (uid, v1, 'concert_played', 'Concert au Petit Bain — 350 personnes, super ambiance');

END $$;
