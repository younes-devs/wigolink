-- Run after schema.sql. This script copies the current app-state document into
-- relational tables without deleting it. It is safe to run again.

insert into public.wigofly_users (id, data, created_at, updated_at)
select item->>'id', item, to_timestamp(coalesce((item->>'createdAt')::double precision, extract(epoch from now()))), now()
from public.wigofly_app_state, jsonb_array_elements(coalesce(state->'users', '[]'::jsonb)) item
where item ? 'id'
on conflict (id) do update set data = excluded.data, updated_at = now();

insert into public.wigofly_trips (id, data, created_at, updated_at)
select item->>'id', item, to_timestamp(coalesce((item->>'createdAt')::double precision, extract(epoch from now()))), now()
from public.wigofly_app_state, jsonb_array_elements(coalesce(state->'trips', '[]'::jsonb)) item
where item ? 'id'
on conflict (id) do update set data = excluded.data, updated_at = now();

insert into public.wigofly_listings (id, data, created_at, updated_at)
select item->>'id', item, to_timestamp(coalesce((item->>'createdAt')::double precision, extract(epoch from now()))), now()
from public.wigofly_app_state, jsonb_array_elements(coalesce(state->'listings', '[]'::jsonb)) item
where item ? 'id'
on conflict (id) do update set data = excluded.data, updated_at = now();

insert into public.wigofly_transactions (id, data, created_at, updated_at)
select item->>'id', item, to_timestamp(coalesce((item->>'createdAt')::double precision, extract(epoch from now()))), now()
from public.wigofly_app_state, jsonb_array_elements(coalesce(state->'transactions', '[]'::jsonb)) item
where item ? 'id'
on conflict (id) do update set data = excluded.data, updated_at = now();

insert into public.wigofly_matching_offers (id, data, created_at, updated_at)
select item->>'id', item, to_timestamp(coalesce((item->>'createdAt')::double precision, extract(epoch from now()))), now()
from public.wigofly_app_state, jsonb_array_elements(coalesce(state->'matchingOffers', '[]'::jsonb)) item
where item ? 'id'
on conflict (id) do update set data = excluded.data, updated_at = now();

insert into public.wigofly_saved_trips (id, data, created_at, updated_at)
select item->>'id', item, to_timestamp(coalesce((item->>'createdAt')::double precision, extract(epoch from now()))), now()
from public.wigofly_app_state, jsonb_array_elements(coalesce(state->'savedTrips', '[]'::jsonb)) item
where item ? 'id'
on conflict (id) do update set data = excluded.data, updated_at = now();

insert into public.wigofly_conversations (id, data, created_at, updated_at)
select item->>'id', item, to_timestamp(coalesce((item->>'createdAt')::double precision, extract(epoch from now()))), now()
from public.wigofly_app_state, jsonb_array_elements(coalesce(state->'conversations', '[]'::jsonb)) item
where item ? 'id'
on conflict (id) do update set data = excluded.data, updated_at = now();

insert into public.wigofly_disputes (id, data, created_at, updated_at)
select item->>'id', item, to_timestamp(coalesce((item->>'createdAt')::double precision, extract(epoch from now()))), now()
from public.wigofly_app_state, jsonb_array_elements(coalesce(state->'disputes', '[]'::jsonb)) item
where item ? 'id'
on conflict (id) do update set data = excluded.data, updated_at = now();

insert into public.wigofly_review_queue (id, data, created_at, updated_at)
select item->>'id', item, to_timestamp(coalesce((item->>'createdAt')::double precision, extract(epoch from now()))), now()
from public.wigofly_app_state, jsonb_array_elements(coalesce(state->'reviewQueue', '[]'::jsonb)) item
where item ? 'id'
on conflict (id) do update set data = excluded.data, updated_at = now();

with ranked_appeals as (
  select item,
    row_number() over (
      partition by item->>'userId', coalesce(item->>'status', 'open')
      order by coalesce((item->>'createdAt')::bigint, 0) desc
    ) as status_rank
  from public.wigofly_app_state,
    jsonb_array_elements(coalesce(state->'safetyAppeals', '[]'::jsonb)) item
  where item ? 'id' and item ? 'userId'
)
insert into public.wigofly_review_queue (id, data, created_at, updated_at)
select item->>'id',
  item || jsonb_build_object(
    'type', 'safety_appeal',
    'refId', item->>'id',
    'status', case
      when coalesce(item->>'status', 'open') = 'open' and status_rank > 1
      then 'superseded'
      else coalesce(item->>'status', 'open')
    end
  ),
  to_timestamp(coalesce((item->>'createdAt')::double precision, extract(epoch from now()))),
  now()
from ranked_appeals
on conflict (id) do update set data = excluded.data, updated_at = now();

insert into public.wigofly_kyc_submissions (id, data, created_at, updated_at)
select item->>'id', item, to_timestamp(coalesce((item->>'createdAt')::double precision, extract(epoch from now()))), now()
from public.wigofly_app_state, jsonb_array_elements(coalesce(state->'kycSubmissions', '[]'::jsonb)) item
where item ? 'id'
on conflict (id) do update set data = excluded.data, updated_at = now();

insert into public.wigofly_kyc_decisions (id, data, created_at, updated_at)
select item->>'id', item, to_timestamp(coalesce((item->>'createdAt')::double precision, extract(epoch from now()))), now()
from public.wigofly_app_state, jsonb_array_elements(coalesce(state->'kycDecisions', '[]'::jsonb)) item
where item ? 'id'
on conflict (id) do update set data = excluded.data, updated_at = now();

insert into public.wigofly_custom_whitelist (id, data, created_at, updated_at)
select coalesce(item->>'id', 'custom-' || md5(item::text)), item, now(), now()
from public.wigofly_app_state, jsonb_array_elements(coalesce(state->'customWhitelist', '[]'::jsonb)) item
on conflict (id) do update set data = excluded.data, updated_at = now();

insert into public.wigofly_runtime_records (kind, id, data, expires_at, updated_at)
select 'otp', key, value, case when nullif(value->>'expiresAt', '') is null then null else to_timestamp((value->>'expiresAt')::double precision / 1000.0) end, now()
from public.wigofly_app_state, jsonb_each(coalesce(state->'otps', '{}'::jsonb))
on conflict (kind, id) do update set data = excluded.data, expires_at = excluded.expires_at, updated_at = now();

insert into public.wigofly_runtime_records (kind, id, data, expires_at, updated_at)
select 'password_reset', key, value, case when nullif(value->>'expiresAt', '') is null then null else to_timestamp((value->>'expiresAt')::double precision / 1000.0) end, now()
from public.wigofly_app_state, jsonb_each(coalesce(state->'resets', '{}'::jsonb))
on conflict (kind, id) do update set data = excluded.data, expires_at = excluded.expires_at, updated_at = now();

insert into public.wigofly_runtime_records (kind, id, data, expires_at, updated_at)
select 'email_verification', key, value, case when nullif(value->>'expiresAt', '') is null then null else to_timestamp((value->>'expiresAt')::double precision / 1000.0) end, now()
from public.wigofly_app_state, jsonb_each(coalesce(state->'pendingVerifications', '{}'::jsonb))
on conflict (kind, id) do update set data = excluded.data, expires_at = excluded.expires_at, updated_at = now();

insert into public.messages (id, tx_id, conversation_id, from_id, text, flagged, at, data)
select item->>'id', nullif(item->>'txId', ''), nullif(item->>'conversationId', ''), nullif(item->>'from', ''),
       coalesce(item->>'text', ''), coalesce((item->>'flagged')::boolean, false),
       to_timestamp(coalesce((item->>'at')::double precision, extract(epoch from now()))), item
from public.wigofly_app_state, jsonb_array_elements(coalesce(state->'messages', '[]'::jsonb)) item
where item ? 'id'
on conflict (id) do update set tx_id = excluded.tx_id, conversation_id = excluded.conversation_id,
  from_id = excluded.from_id, text = excluded.text, flagged = excluded.flagged, at = excluded.at, data = excluded.data;
