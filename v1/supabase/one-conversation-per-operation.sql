begin;

create temporary table conversation_operation_merge on commit drop as
select id as duplicate_id, keeper_id
from (
  select
    id,
    first_value(id) over (
      partition by data->>'operationId'
      order by created_at asc, id asc
    ) as keeper_id,
    row_number() over (
      partition by data->>'operationId'
      order by created_at asc, id asc
    ) as position
  from public.wigolink_conversations
  where nullif(data->>'operationId', '') is not null
) ranked
where position > 1;

-- Preserve every message while moving duplicate threads into the canonical one.
update public.messages message
set client_id = null
from conversation_operation_merge merge
where message.conversation_id = merge.duplicate_id;

update public.messages message
set conversation_id = merge.keeper_id
from conversation_operation_merge merge
where message.conversation_id = merge.duplicate_id;

insert into public.wigolink_conversation_members (
  conversation_id,
  user_id,
  archived,
  pinned,
  deleted,
  blocked,
  last_read_at,
  created_at,
  updated_at
)
select
  merge.keeper_id,
  member.user_id,
  bool_and(member.archived),
  bool_or(member.pinned),
  bool_and(member.deleted),
  bool_or(member.blocked),
  max(member.last_read_at),
  min(member.created_at),
  now()
from conversation_operation_merge merge
join public.wigolink_conversation_members member
  on member.conversation_id = merge.duplicate_id
group by merge.keeper_id, member.user_id
on conflict (conversation_id, user_id) do update
set archived = public.wigolink_conversation_members.archived and excluded.archived,
    pinned = public.wigolink_conversation_members.pinned or excluded.pinned,
    deleted = public.wigolink_conversation_members.deleted and excluded.deleted,
    blocked = public.wigolink_conversation_members.blocked or excluded.blocked,
    last_read_at = greatest(
      public.wigolink_conversation_members.last_read_at,
      excluded.last_read_at
    ),
    updated_at = now();

update public.wigolink_conversation_reports report
set conversation_id = merge.keeper_id
from conversation_operation_merge merge
where report.conversation_id = merge.duplicate_id;

update public.wigolink_conversation_members member
set deleted = true,
    updated_at = now()
from conversation_operation_merge merge
where member.conversation_id = merge.duplicate_id;

update public.wigolink_conversations conversation
set data = jsonb_set(conversation.data, '{operationId}', 'null'::jsonb, true)
    || jsonb_build_object(
      'mergedIntoId', merge.keeper_id,
      'mergedAt', (extract(epoch from now()) * 1000)::bigint,
      'deletedBy', coalesce(conversation.data->'participantIds', '[]'::jsonb)
    ),
    updated_at = now()
from conversation_operation_merge merge
where conversation.id = merge.duplicate_id;

create unique index if not exists wigolink_conversations_operation_unique_idx
  on public.wigolink_conversations ((data->>'operationId'))
  where nullif(data->>'operationId', '') is not null;

commit;

