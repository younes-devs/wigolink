begin;

create table if not exists public.manual_payout_accounts (
  id text primary key,
  user_id text not null references public.wigolink_users(id),
  country text not null check (country = upper(country) and length(country) = 2),
  details_ciphertext text not null,
  account_last4 text not null,
  status text not null default 'verified',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists manual_payout_accounts_active_user_idx
  on public.manual_payout_accounts (user_id) where active;
create index if not exists manual_payout_accounts_user_history_idx
  on public.manual_payout_accounts (user_id, created_at desc);

alter table public.operation_payments
  add column if not exists payout_method text not null default 'stripe_connect';

create table if not exists public.manual_payout_requests (
  operation_id text primary key references public.wigolink_transactions(id),
  traveler_id text not null references public.wigolink_users(id),
  payout_account_id text not null references public.manual_payout_accounts(id),
  amount_cents integer not null check (amount_cents > 0),
  currency text not null check (currency = upper(currency) and length(currency) = 3),
  status text not null default 'pending',
  transfer_reference text,
  processed_by text references public.wigolink_users(id),
  requested_at timestamptz not null default now(),
  processed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists manual_payout_requests_queue_idx
  on public.manual_payout_requests (status, requested_at);

alter table public.manual_payout_accounts enable row level security;
alter table public.manual_payout_requests enable row level security;

revoke all on table public.manual_payout_accounts, public.manual_payout_requests
  from anon, authenticated;

commit;
