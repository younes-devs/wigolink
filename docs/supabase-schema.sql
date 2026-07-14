-- =============================================================================
-- Wigofly — Schéma Postgres initial (Supabase) — PRD Production P0.1
-- =============================================================================
--
-- But : sortir Wigofly du fichier `v1/server/data.json` (démo locale) vers une vraie
-- base durable et concurrente. Ce schéma modélise fidèlement le domaine tel qu'il
-- existe aujourd'hui dans l'API Express, en le mettant en forme production :
-- clés étrangères, index, contraintes d'états, horodatages.
--
-- Stratégie de migration (voir docs/deploiement.md) :
--   1. Cette base est créée dans Supabase.
--   2. L'API Express reste l'unique point d'accès (pas d'accès direct frontend en V1,
--      donc pas de Row Level Security requise tout de suite).
--   3. Un adaptateur de persistance (repository) remplace progressivement les accès
--      directs à `db.<collection>` dans server/index.js, collection par collection,
--      derrière la même interface — sans casser le mode démo JSON tant que la
--      migration n'est pas complète.
--
-- Convention :
--   - Les identifiants métier existants sont des chaînes préfixées ('u-…', 'l-…',
--     'tx-…'). On les conserve comme clés primaires TEXT pour une bascule sans
--     réécriture des références croisées déjà stockées.
--   - Les montants monétaires sont en NUMERIC(10,2) (euros), jamais en float.
--   - Les horodatages « métier » historisés en epoch ms (BIGINT) côté app sont
--     exposés ici en TIMESTAMPTZ ; l'adaptateur convertit à l'écriture/lecture.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- Comptes & profils
-- ----------------------------------------------------------------------------
create table if not exists users (
  id             text primary key,                        -- 'u-…'
  name           text not null,
  email          text unique not null,
  password_hash  text,                                    -- scrypt 'salt:hash' ; null si provider externe
  provider       text not null default 'email',           -- 'email' | 'google' | …
  email_verified boolean not null default false,
  phone          text,
  city           text,
  avatar         text,                                     -- emoji ou null (photo_url pour l'upload réel)
  photo_url      text,
  is_admin       boolean not null default false,
  kyc_status     text not null default 'none'
                   check (kyc_status in ('none','pending','verified','refused')),
  training_done  boolean not null default false,
  rating         numeric(3,2),
  rating_count   integer not null default 0,
  completed      integer not null default 0,
  cancel_rate    numeric(4,3) not null default 0,
  max_value      numeric(10,2) not null default 100,       -- plafond valeur (relevé avec l'historique)
  max_active     integer not null default 1,               -- plafond transactions actives
  badges         jsonb not null default '[]',
  settings       jsonb not null default '{}',              -- préférences notifications, onboardingDone…
  created_at     timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Sessions & flux d'authentification (email vérif / reset mot de passe)
-- ----------------------------------------------------------------------------
create table if not exists sessions (
  token       text primary key,
  user_id     text not null references users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz                                   -- expiration/révocation (P0.2)
);
create index if not exists idx_sessions_user on sessions(user_id);

create table if not exists pending_verifications (
  email       text primary key,
  code        text not null,                               -- code 6 chiffres (envoyé par email en prod, jamais renvoyé par l'API)
  user_id     text references users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz
);

create table if not exists password_resets (
  email       text primary key,
  code        text not null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz
);

-- ----------------------------------------------------------------------------
-- Vérification d'identité (KYC manuel V1)
-- ----------------------------------------------------------------------------
create table if not exists kyc_submissions (
  id             text primary key,                          -- 'kyc-…'
  user_id        text not null references users(id) on delete cascade,
  legal_name     text not null,
  birth_date     date,
  document_type  text,                                       -- 'passport' | 'id_card' | …
  selfie_url     text,                                       -- Supabase Storage privé (URL signée)
  id_front_url   text,
  id_back_url    text,
  status         text not null default 'pending'
                   check (status in ('pending','approved','refused')),
  attempt        integer not null default 1,                 -- MAX_KYC_ATTEMPTS = 3
  created_at     timestamptz not null default now()
);
create index if not exists idx_kyc_sub_user on kyc_submissions(user_id);
create index if not exists idx_kyc_sub_status on kyc_submissions(status);

create table if not exists kyc_decisions (
  id             text primary key,                          -- 'kycd-…'
  submission_id  text not null references kyc_submissions(id) on delete cascade,
  user_id        text not null references users(id) on delete cascade,
  admin_id       text references users(id),
  decision       text not null check (decision in ('approve','refuse')),
  reason         text,
  created_at     timestamptz not null default now()
);
create index if not exists idx_kyc_dec_submission on kyc_decisions(submission_id);

-- ----------------------------------------------------------------------------
-- Trajets voyageurs
-- ----------------------------------------------------------------------------
create table if not exists trips (
  id           text primary key,                            -- 't-…'
  traveler_id  text not null references users(id) on delete cascade,
  from_city    text not null,
  to_city      text not null,
  date         date not null,
  capacity_kg  numeric(6,2) not null,
  created_at   timestamptz not null default now()
);
create index if not exists idx_trips_traveler on trips(traveler_id);

-- ----------------------------------------------------------------------------
-- Annonces (colis à envoyer)
-- ----------------------------------------------------------------------------
create table if not exists listings (
  id                text primary key,                        -- 'l-…'
  sender_id         text not null references users(id) on delete cascade,
  recipient_id      text references users(id),               -- destinataire reconnu, sinon null
  title             text not null,
  category_id       text not null,
  category_label    text,
  icon              text,
  description       text,
  photos            jsonb not null default '[]',             -- URLs Supabase Storage (public non sensible)
  weight_kg         numeric(6,2) not null,
  value_eur         numeric(10,2) not null,
  from_city         text not null,
  to_city           text not null,
  date_from         date not null,
  date_to           date not null,
  traveler_pay      numeric(10,2) not null,
  commission_rate   numeric(4,3) not null default 0.18,
  status            text not null default 'published'
                      check (status in ('draft','published','pending_review','matched','archived')),
  whitelist_verdict text check (whitelist_verdict in ('whitelisted','gray','blacklisted')),
  created_at        timestamptz not null default now()
);
create index if not exists idx_listings_sender on listings(sender_id);
create index if not exists idx_listings_status on listings(status);
create index if not exists idx_listings_route on listings(from_city, to_city);

-- ----------------------------------------------------------------------------
-- Propositions de matching (négociation offre / contre-offre)
-- ----------------------------------------------------------------------------
create table if not exists matching_offers (
  id            text primary key,                            -- 'mo-…'
  listing_id    text not null references listings(id) on delete cascade,
  sender_id     text not null references users(id) on delete cascade,
  traveler_id   text not null references users(id) on delete cascade,
  status        text not null
                  check (status in ('pending','pending_traveler','countered_sender',
                                    'accepted','declined','withdrawn','closed','expired')),
  offered_pay   numeric(10,2),
  message       text,
  tx_id         text,                                        -- rempli à l'acceptation (FK ajoutée après transactions, plus bas)
  created_at    timestamptz not null default now(),
  expires_at    timestamptz,
  responded_at  timestamptz
);
create index if not exists idx_offers_listing on matching_offers(listing_id);
create index if not exists idx_offers_traveler on matching_offers(traveler_id);
create index if not exists idx_offers_status on matching_offers(status);

-- ----------------------------------------------------------------------------
-- Transactions + escrow « provider-ready » (P0.4)
-- ----------------------------------------------------------------------------
-- Machine à états : accepted → sealed → in_transit → released | refunded | cancelled
--                   (disputed gèle l'escrow le temps de l'arbitrage admin).
-- Escrow SIMULÉ en V1 (aucun mouvement réel) mais le modèle porte déjà les champs
-- prestataire pour brancher Stripe Connect / Mangopay / Lemonway sans refonte :
--   payment_provider, payment_intent_id, escrow_status, montants, horodatages.
create table if not exists transactions (
  id                text primary key,                        -- 'tx-…'
  listing_id        text not null references listings(id),
  sender_id         text not null references users(id),
  traveler_id       text not null references users(id),
  recipient_id      text not null references users(id),
  status            text not null default 'accepted'
                      check (status in ('accepted','sealed','in_transit','disputed',
                                        'released','refunded','cancelled')),

  -- Escrow / paiement
  payment_provider  text not null default 'simulated',       -- escrow.provider
  payment_intent_id text,                                     -- escrow.providerRef (Stripe paymentIntentId…)
  escrow_status     text not null default 'held'
                      check (escrow_status in ('held','frozen','released','refunded')),
  escrow_amount     numeric(10,2) not null,                  -- total séquestré
  traveler_pay      numeric(10,2) not null,                  -- part voyageur
  commission_amount numeric(10,2) not null,                  -- part plateforme
  held_at           timestamptz,
  frozen_at         timestamptz,
  released_at       timestamptz,
  refunded_at       timestamptz,

  -- Preuves / codes
  pickup_code       text,                                     -- présenté par l'expéditeur
  delivery_code     text,                                     -- présenté par le voyageur
  sealing_video     jsonb,                                    -- {recordedAt, geo, dataUrl|storage, simulated}

  created_at        timestamptz not null default now()
);
create index if not exists idx_tx_sender on transactions(sender_id);
create index if not exists idx_tx_traveler on transactions(traveler_id);
create index if not exists idx_tx_recipient on transactions(recipient_id);
create index if not exists idx_tx_status on transactions(status);
create index if not exists idx_tx_escrow on transactions(escrow_status);

-- Historique d'événements d'une transaction (audit du cycle de vie)
create table if not exists transaction_events (
  id        text primary key,                                -- 'e-…'
  tx_id     text not null references transactions(id) on delete cascade,
  type      text not null,                                   -- accepted, sealed, in_transit, released…
  actor_id  text references users(id),
  meta      jsonb not null default '{}',
  at        timestamptz not null default now()
);
create index if not exists idx_tx_events_tx on transaction_events(tx_id);

-- ----------------------------------------------------------------------------
-- Messagerie (chiffrée côté plateforme, désintermédiation surveillée)
-- ----------------------------------------------------------------------------
create table if not exists messages (
  id         text primary key,                               -- 'm-…'
  tx_id      text not null references transactions(id) on delete cascade,
  from_id    text not null references users(id),
  text       text not null,
  flagged    boolean not null default false,                 -- coordonnées hors app détectées
  at         timestamptz not null default now()
);
create index if not exists idx_messages_tx on messages(tx_id);
create index if not exists idx_messages_flagged on messages(flagged) where flagged;

-- ----------------------------------------------------------------------------
-- Litiges (structurés : preuves, deadline, décision reliée au paiement)
-- ----------------------------------------------------------------------------
create table if not exists disputes (
  id           text primary key,                             -- 'd-…'
  tx_id        text not null references transactions(id) on delete cascade,
  opened_by    text not null references users(id),
  reason       text not null,
  evidence     jsonb not null default '[]',                  -- [{authorId, text|url, at}]
  status       text not null default 'open'
                 check (status in ('open','resolved')),
  resolution   text check (resolution in ('release_traveler','refund_sender')),
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz
);
create index if not exists idx_disputes_tx on disputes(tx_id);
create index if not exists idx_disputes_status on disputes(status);

-- ----------------------------------------------------------------------------
-- Notifications in-app (texte traduit à la lecture selon la langue du lecteur)
-- ----------------------------------------------------------------------------
create table if not exists notifications (
  id       text primary key,                                 -- 'n-…'
  user_id  text not null references users(id) on delete cascade,
  tx_id    text references transactions(id) on delete cascade,
  type     text not null,                                    -- transactions|messages|shipments|reminders|security
  section  text,
  key      text,                                             -- clé de template i18n (notify-i18n.js)
  params   jsonb,                                            -- paramètres du template
  text     text,                                             -- repli legacy (notifications historiques sans clé)
  read     boolean not null default false,
  at       timestamptz not null default now()
);
create index if not exists idx_notifs_user on notifications(user_id);
create index if not exists idx_notifs_unread on notifications(user_id) where read = false;

-- ----------------------------------------------------------------------------
-- File de revue humaine (annonces zone grise, litiges à arbitrer)
-- ----------------------------------------------------------------------------
create table if not exists review_queue (
  id          text primary key,                              -- 'rq-…'
  type        text not null check (type in ('listing','dispute')),
  ref_id      text not null,                                 -- listing.id ou dispute.id
  status      text not null default 'open' check (status in ('open','closed')),
  created_at  timestamptz not null default now()
);
create index if not exists idx_review_status on review_queue(status);

-- ----------------------------------------------------------------------------
-- Liste blanche personnalisée (catégories promues depuis la zone grise par un admin)
-- ----------------------------------------------------------------------------
create table if not exists custom_whitelist (
  id          text primary key,
  label       text not null,
  max_qty     text,
  icon        text,
  added_from  text references listings(id),                  -- annonce à l'origine de la promotion
  added_at    timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Journal d'audit des actions sensibles (P0.8) — table cible, à alimenter
-- ----------------------------------------------------------------------------
create table if not exists audit_logs (
  id          bigint generated always as identity primary key,
  actor_id    text references users(id),
  action      text not null,                                 -- kyc_decide, dispute_resolve, escrow_release…
  target_type text,                                          -- 'transaction' | 'kyc_submission' | …
  target_id   text,
  meta        jsonb not null default '{}',
  at          timestamptz not null default now()
);
create index if not exists idx_audit_actor on audit_logs(actor_id);
create index if not exists idx_audit_action on audit_logs(action);

-- ----------------------------------------------------------------------------
-- Contraintes croisées (ajoutées après coup pour éviter les dépendances d'ordre
-- de création : matching_offers.tx_id référence transactions, créée plus haut).
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'fk_matching_offers_tx') then
    alter table matching_offers
      add constraint fk_matching_offers_tx
      foreign key (tx_id) references transactions(id) on delete set null;
  end if;
end $$;
create index if not exists idx_offers_tx on matching_offers(tx_id);
