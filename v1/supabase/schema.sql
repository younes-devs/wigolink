-- Etat transactionnel Wigofly. L'API utilise la connexion Postgres privee;
-- aucune cle Supabase navigateur n'est exposee.
create table if not exists public.wigofly_app_state (
  id smallint primary key check (id = 1),
  state jsonb not null,
  revision bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.wigofly_app_state (id, state)
values (
  1,
  '{"users":[],"trips":[],"listings":[],"transactions":[],"matchingOffers":[],"savedTrips":[],"conversations":[],"messages":[],"notifications":[],"disputes":[],"reviewQueue":[],"otps":{},"sessions":{},"resets":{},"pendingVerifications":{},"customWhitelist":[],"kycSubmissions":[],"kycDecisions":[],"auditLogs":[],"nextId":100}'::jsonb
)
on conflict (id) do nothing;

revoke all on table public.wigofly_app_state from anon, authenticated;

create table if not exists public.wigofly_sessions (
  token_hash text primary key,
  user_id text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists wigofly_sessions_user_id_idx on public.wigofly_sessions (user_id);
create index if not exists wigofly_sessions_expires_at_idx on public.wigofly_sessions (expires_at);
revoke all on table public.wigofly_sessions from anon, authenticated;

-- Collections relationnelles a fort volume. Elles sont lues et ecrites directement
-- par l'API, au lieu de forcer le chargement du document JSON global.
create table if not exists public.audit_logs (
  id bigserial primary key,
  actor_id text,
  action text not null,
  target_type text,
  target_id text,
  meta jsonb not null default '{}'::jsonb,
  at timestamptz not null default now()
);

create index if not exists audit_logs_at_idx on public.audit_logs (at desc);
create index if not exists audit_logs_actor_id_idx on public.audit_logs (actor_id);
create index if not exists audit_logs_actor_at_idx on public.audit_logs (actor_id, at desc);
create index if not exists audit_logs_target_at_idx on public.audit_logs (target_id, at desc);

create table if not exists public.notifications (
  id text primary key,
  user_id text not null,
  tx_id text,
  type text not null,
  section text,
  key text,
  params jsonb not null default '{}'::jsonb,
  text text,
  read boolean not null default false,
  at timestamptz not null default now()
);

create index if not exists notifications_user_at_idx on public.notifications (user_id, at desc);
create index if not exists notifications_user_unread_idx on public.notifications (user_id) where read = false;
create index if not exists notifications_retention_idx on public.notifications (at);

create table if not exists public.messages (
  id text primary key,
  tx_id text not null,
  from_id text not null,
  text text not null,
  flagged boolean not null default false,
  at timestamptz not null default now()
);

create index if not exists messages_tx_at_idx on public.messages (tx_id, at);
create index if not exists messages_flagged_idx on public.messages (flagged) where flagged = true;
create index if not exists messages_sender_at_idx on public.messages (from_id, at desc);

-- Normalized application records. Every entity keeps its full historical payload in
-- data while the indexes below support the query patterns used by the API. This
-- permits a gradual, verified migration away from the single app-state document.
create table if not exists public.wigofly_users (
  id text primary key,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists wigofly_users_email_idx on public.wigofly_users ((lower(data->>'email'))) where data ? 'email';
create index if not exists wigofly_users_kyc_idx on public.wigofly_users ((data->>'kycStatus'));

create table if not exists public.wigofly_trips (
  id text primary key,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists wigofly_trips_traveler_date_idx on public.wigofly_trips ((data->>'travelerId'), (data->>'date'));
create index if not exists wigofly_trips_route_date_idx on public.wigofly_trips ((lower(data->>'from')), (lower(data->>'to')), (data->>'date'));
create index if not exists wigofly_trips_feed_idx on public.wigofly_trips ((coalesce(data->>'status', 'published')), (coalesce(data->>'departureDate', data->>'date')));
create extension if not exists pg_trgm;
create index if not exists wigofly_trips_from_location_idx on public.wigofly_trips ((data->>'fromLocationId')) where data ? 'fromLocationId';
create index if not exists wigofly_trips_to_location_idx on public.wigofly_trips ((data->>'toLocationId')) where data ? 'toLocationId';
create index if not exists wigofly_trips_from_trgm_idx on public.wigofly_trips using gin ((data->>'from') gin_trgm_ops);
create index if not exists wigofly_trips_to_trgm_idx on public.wigofly_trips using gin ((data->>'to') gin_trgm_ops);

create table if not exists public.wigofly_listings (
  id text primary key,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists wigofly_listings_sender_status_idx on public.wigofly_listings ((data->>'senderId'), (data->>'status'));
create index if not exists wigofly_listings_route_status_idx on public.wigofly_listings ((lower(data->>'from')), (lower(data->>'to')), (data->>'status'));

create table if not exists public.wigofly_transactions (
  id text primary key,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists wigofly_transactions_sender_status_idx on public.wigofly_transactions ((data->>'senderId'), (data->>'status'));
create index if not exists wigofly_transactions_traveler_status_idx on public.wigofly_transactions ((data->>'travelerId'), (data->>'status'));
create index if not exists wigofly_transactions_listing_idx on public.wigofly_transactions ((data->>'listingId'));
create index if not exists wigofly_transactions_trip_idx on public.wigofly_transactions ((data->>'tripId'));

create table if not exists public.wigofly_matching_offers (
  id text primary key,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists wigofly_matching_offers_traveler_status_idx on public.wigofly_matching_offers ((data->>'travelerId'), (data->>'status'));
create index if not exists wigofly_matching_offers_listing_idx on public.wigofly_matching_offers ((data->>'listingId'));

create table if not exists public.wigofly_saved_trips (
  id text primary key,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists wigofly_saved_trips_user_trip_idx on public.wigofly_saved_trips ((data->>'userId'), (data->>'tripId'));

create table if not exists public.wigofly_conversations (
  id text primary key,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists wigofly_conversations_last_message_idx on public.wigofly_conversations ((data->>'lastMessageAt'));
create index if not exists wigofly_conversations_operation_idx on public.wigofly_conversations ((data->>'operationId'));
create index if not exists wigofly_conversations_participants_idx on public.wigofly_conversations using gin ((data->'participantIds'));

create table if not exists public.wigofly_disputes (
  id text primary key,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists wigofly_disputes_tx_status_idx on public.wigofly_disputes ((data->>'txId'), (data->>'status'));

create table if not exists public.wigofly_review_queue (
  id text primary key,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists wigofly_review_queue_status_created_idx on public.wigofly_review_queue ((data->>'status'), created_at desc);

create table if not exists public.wigofly_kyc_submissions (
  id text primary key,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists wigofly_kyc_submissions_user_idx on public.wigofly_kyc_submissions ((data->>'userId'));
create index if not exists wigofly_kyc_submissions_user_created_idx on public.wigofly_kyc_submissions ((data->>'userId'), created_at desc);
create index if not exists wigofly_kyc_submissions_status_created_idx on public.wigofly_kyc_submissions ((data->>'status'), created_at);

create table if not exists public.wigofly_kyc_decisions (
  id text primary key,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists wigofly_kyc_decisions_submission_idx on public.wigofly_kyc_decisions ((data->>'submissionId'));

create table if not exists public.wigofly_custom_whitelist (
  id text primary key,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wigofly_runtime_records (
  kind text not null,
  id text not null,
  data jsonb not null,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (kind, id)
);
create index if not exists wigofly_runtime_records_expiry_idx on public.wigofly_runtime_records (expires_at) where expires_at is not null;
create index if not exists wigofly_runtime_records_kind_expiry_idx on public.wigofly_runtime_records (kind, expires_at) where expires_at is not null;

alter table public.messages add column if not exists conversation_id text;
alter table public.messages add column if not exists data jsonb not null default '{}'::jsonb;
alter table public.messages alter column tx_id drop not null;
create index if not exists messages_conversation_at_idx on public.messages (conversation_id, at);

revoke all on table public.wigofly_users, public.wigofly_trips, public.wigofly_listings,
  public.wigofly_transactions, public.wigofly_matching_offers, public.wigofly_saved_trips,
  public.wigofly_conversations, public.wigofly_disputes, public.wigofly_review_queue,
  public.wigofly_kyc_submissions, public.wigofly_kyc_decisions, public.wigofly_custom_whitelist,
  public.wigofly_runtime_records from anon, authenticated;

-- Import idempotent des donnees deja presentes dans wigofly_app_state.
insert into public.notifications (id, user_id, tx_id, type, section, key, params, text, read, at)
select item->>'id', item->>'userId', nullif(item->>'txId', ''), coalesce(item->>'type', 'transactions'),
       nullif(item->>'section', ''), nullif(item->>'key', ''), coalesce(item->'params', '{}'::jsonb),
       nullif(item->>'text', ''), coalesce((item->>'read')::boolean, false),
       to_timestamp(coalesce((item->>'at')::double precision, extract(epoch from now())))
from public.wigofly_app_state, jsonb_array_elements(coalesce(state->'notifications', '[]'::jsonb)) item
where item ? 'id' and item ? 'userId'
on conflict (id) do nothing;

insert into public.messages (id, tx_id, from_id, text, flagged, at)
select item->>'id', item->>'txId', item->>'from', coalesce(item->>'text', ''),
       coalesce((item->>'flagged')::boolean, false),
       to_timestamp(coalesce((item->>'at')::double precision, extract(epoch from now())))
from public.wigofly_app_state, jsonb_array_elements(coalesce(state->'messages', '[]'::jsonb)) item
where item ? 'id' and item ? 'txId' and item ? 'from'
on conflict (id) do nothing;

insert into public.audit_logs (actor_id, action, target_type, target_id, meta, at)
select nullif(item->>'actorId', ''), item->>'action', nullif(item->>'targetType', ''),
       nullif(item->>'targetId', ''), coalesce(item->'meta', '{}'::jsonb),
       to_timestamp(coalesce((item->>'at')::double precision, extract(epoch from now())))
from public.wigofly_app_state, jsonb_array_elements(coalesce(state->'auditLogs', '[]'::jsonb)) item
where item ? 'action'
  and not exists (
    select 1 from public.audit_logs current
    where current.actor_id is not distinct from nullif(item->>'actorId', '')
      and current.action = item->>'action'
      and current.target_type is not distinct from nullif(item->>'targetType', '')
      and current.target_id is not distinct from nullif(item->>'targetId', '')
      and current.at = to_timestamp(coalesce((item->>'at')::double precision, extract(epoch from now())))
  );

revoke all on table public.audit_logs, public.notifications, public.messages from anon, authenticated;
