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
