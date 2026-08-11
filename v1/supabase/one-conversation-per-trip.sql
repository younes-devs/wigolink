begin;

create temporary table conversation_trip_rows on commit drop as
select
  conversation.id,
  conversation.data,
  conversation.created_at,
  conversation.data->>'tripId' as trip_id,
  (
    select jsonb_agg(participant order by participant)
    from jsonb_array_elements_text(conversation.data->'participantIds') participant
  ) as participants
from public.wigolink_conversations conversation
where nullif(conversation.data->>'tripId', '') is not null
  and coalesce(
    nullif(conversation.data->>'mergedInto', ''),
    nullif(conversation.data->>'mergedIntoId', '')
  ) is null;

create temporary table conversation_trip_merge on commit drop as
select id as duplicate_id, keeper_id
from (
  select
    id,
    first_value(id) over (
      partition by trip_id, participants
      order by created_at asc, id asc
    ) as keeper_id,
    row_number() over (
      partition by trip_id, participants
      order by created_at asc, id asc
    ) as position
  from conversation_trip_rows
) ranked
where position > 1;

create temporary table conversation_trip_all on commit drop as
select id as source_id,
       first_value(id) over (
         partition by trip_id, participants
         order by created_at asc, id asc
       ) as keeper_id
from conversation_trip_rows;

update public.messages message
set client_id = null
from conversation_trip_merge merge
where message.conversation_id = merge.duplicate_id;

update public.messages message
set conversation_id = merge.keeper_id,
    data = jsonb_set(message.data, '{conversationId}', to_jsonb(merge.keeper_id), true)
from conversation_trip_merge merge
where message.conversation_id = merge.duplicate_id;

insert into public.wigolink_conversation_members (
  conversation_id, user_id, archived, pinned, deleted, blocked,
  last_read_at, created_at, updated_at
)
select
  grouped.keeper_id,
  member.user_id,
  bool_and(member.archived),
  bool_or(member.pinned),
  bool_and(member.deleted),
  bool_or(member.blocked),
  max(member.last_read_at),
  min(member.created_at),
  now()
from conversation_trip_all grouped
join public.wigolink_conversation_members member
  on member.conversation_id = grouped.source_id
group by grouped.keeper_id, member.user_id
on conflict (conversation_id, user_id) do update set
  archived = excluded.archived,
  pinned = excluded.pinned,
  deleted = excluded.deleted,
  blocked = excluded.blocked,
  last_read_at = excluded.last_read_at,
  updated_at = now();

update public.wigolink_conversation_members member
set deleted = true, updated_at = now()
from conversation_trip_merge merge
where member.conversation_id = merge.duplicate_id;

update public.wigolink_conversation_reports report
set conversation_id = merge.keeper_id,
    data = jsonb_set(report.data, '{conversationId}', to_jsonb(merge.keeper_id), true)
from conversation_trip_merge merge
where report.conversation_id = merge.duplicate_id;

update public.wigolink_review_queue review
set data = jsonb_set(review.data, '{refId}', to_jsonb(merge.keeper_id), true),
    updated_at = now()
from conversation_trip_merge merge
where review.data->>'type' = 'conversation'
  and review.data->>'refId' = merge.duplicate_id;

update public.wigolink_conversations conversation
set data = (conversation.data
      || jsonb_build_object(
        'mergedInto', merge.keeper_id,
        'mergedIntoId', merge.keeper_id,
        'mergedAt', (extract(epoch from now()) * 1000)::bigint,
        'mergedOperationId', conversation.data->'operationId'
      ))
      - 'operationId',
    updated_at = now()
from conversation_trip_merge merge
where conversation.id = merge.duplicate_id;

with canonical as (
  select
    grouped.keeper_id,
    max((row.data->>'lastMessageAt')::bigint) as last_message_at,
    (array_agg(
      nullif(row.data->>'operationId', '')
      order by row.created_at desc, row.id desc
    ) filter (where nullif(row.data->>'operationId', '') is not null))[1] as operation_id,
    (array_agg(row.participants))[1] as participants
  from conversation_trip_all grouped
  join conversation_trip_rows row on row.id = grouped.source_id
  group by grouped.keeper_id
)
update public.wigolink_conversations conversation
set data = jsonb_set(
      jsonb_set(
        conversation.data,
        '{participantIds}',
        canonical.participants,
        true
      ),
      '{lastMessageAt}',
      to_jsonb(coalesce(canonical.last_message_at, 0)),
      true
    ) || case
      when canonical.operation_id is null then '{}'::jsonb
      else jsonb_build_object('operationId', canonical.operation_id)
    end,
    updated_at = now()
from canonical
where conversation.id = canonical.keeper_id;

drop index if exists public.wigolink_conversations_trip_participants_unique_idx;
create unique index wigolink_conversations_trip_participants_unique_idx
  on public.wigolink_conversations ((data->'participantIds'), (data->>'tripId'))
  where nullif(data->>'tripId', '') is not null
    and coalesce(nullif(data->>'mergedInto', ''), nullif(data->>'mergedIntoId', '')) is null;

commit;
