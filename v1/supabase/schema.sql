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
