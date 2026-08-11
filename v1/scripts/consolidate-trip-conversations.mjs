import { createPostgresPool } from '../server/postgres-repositories.js';

const write = process.argv.includes('--write');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL est requis. Ne partagez jamais cette valeur dans un chat.');
}

const pool = createPostgresPool({ connectionString: process.env.DATABASE_URL, max: 1 });
const client = await pool.connect();

try {
  await client.query('begin');
  const result = await client.query(
    `select id, data, created_at, updated_at
     from public.wigolink_conversations
     where nullif(data->>'tripId', '') is not null
     order by created_at asc, id asc
     for update`,
  );
  const groups = groupedConversations(result.rows);
  const duplicates = [...groups.values()].filter((rows) => rows.length > 1);
  let mergedConversations = 0;
  let movedMessages = 0;
  let normalizedConversations = 0;

  if (write) {
    for (const rows of duplicates) {
      const [canonical, ...redundant] = rows;
      const redundantIds = redundant.map((row) => row.id);
      const allIds = rows.map((row) => row.id);
      const merged = await mergedConversationData(client, rows);

      await client.query(
        `update public.messages
         set client_id = null
         where conversation_id = any($1::text[])`,
        [redundantIds],
      );
      const moved = await client.query(
        `update public.messages
         set conversation_id = $1,
             data = jsonb_set(data, '{conversationId}', to_jsonb($1::text), true)
         where conversation_id = any($2::text[])`,
        [canonical.id, redundantIds],
      );
      movedMessages += moved.rowCount;

      await client.query(
        `insert into public.wigolink_conversation_members (
           conversation_id, user_id, archived, pinned, deleted, blocked,
           last_read_at, created_at, updated_at
         )
         select $1, user_id, bool_and(archived), bool_or(pinned),
                bool_and(deleted), bool_or(blocked), max(last_read_at),
                min(created_at), now()
         from public.wigolink_conversation_members
         where conversation_id = any($2::text[])
         group by user_id
         on conflict (conversation_id, user_id) do update set
           archived = excluded.archived,
           pinned = excluded.pinned,
           deleted = excluded.deleted,
           blocked = excluded.blocked,
           last_read_at = excluded.last_read_at,
           updated_at = now()`,
        [canonical.id, allIds],
      );
      await client.query(
        `update public.wigolink_conversation_reports
         set conversation_id = $1,
             data = jsonb_set(data, '{conversationId}', to_jsonb($1::text), true)
         where conversation_id = any($2::text[])`,
        [canonical.id, redundantIds],
      );
      await client.query(
        `update public.wigolink_review_queue
         set data = jsonb_set(data, '{refId}', to_jsonb($1::text), true),
             updated_at = now()
         where data->>'type' = 'conversation'
           and data->>'refId' = any($2::text[])`,
        [canonical.id, redundantIds],
      );
      await client.query(
        `update public.wigolink_conversations
         set data = (data
           || jsonb_build_object(
             'mergedInto', $1::text,
             'mergedIntoId', $1::text,
             'mergedAt', (extract(epoch from now()) * 1000)::bigint,
             'mergedOperationId', data->'operationId'
           ))
           - 'operationId',
             updated_at = now()
         where id = any($2::text[])`,
        [canonical.id, redundantIds],
      );
      await client.query(
        `update public.wigolink_conversations
         set data = $2::jsonb, updated_at = now()
         where id = $1`,
        [canonical.id, JSON.stringify(merged)],
      );
      mergedConversations += redundantIds.length;
    }

    for (const rows of groups.values()) {
      if (rows.length !== 1 || !rows[0].participantsChanged) continue;
      await client.query(
        `update public.wigolink_conversations
         set data = $2::jsonb, updated_at = now()
         where id = $1`,
        [rows[0].id, JSON.stringify(rows[0].data)],
      );
      normalizedConversations += 1;
    }

    await client.query('drop index if exists public.wigolink_conversations_trip_participants_unique_idx');
    await client.query(
      `create unique index wigolink_conversations_trip_participants_unique_idx
       on public.wigolink_conversations ((data->'participantIds'), (data->>'tripId'))
       where nullif(data->>'tripId', '') is not null
         and coalesce(nullif(data->>'mergedInto', ''), nullif(data->>'mergedIntoId', '')) is null`,
    );
    await client.query('commit');
  } else {
    await client.query('rollback');
  }

  console.log(JSON.stringify({
    dryRun: !write,
    duplicateGroups: duplicates.length,
    duplicateConversations: duplicates.reduce((count, rows) => count + rows.length - 1, 0),
    mergedConversations,
    movedMessages,
    normalizedConversations,
  }, null, 2));
} catch (error) {
  await client.query('rollback').catch(() => {});
  throw error;
} finally {
  client.release();
  await pool.end();
}

function groupedConversations(rows) {
  const groups = new Map();
  for (const row of rows) {
    const originalParticipants = row.data?.participantIds || [];
    const participants = [...new Set(originalParticipants)].sort();
    const tripId = String(row.data?.tripId || '');
    const key = JSON.stringify([participants, tripId]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({
      ...row,
      participantsChanged: JSON.stringify(originalParticipants) !== JSON.stringify(participants),
      data: { ...row.data, participantIds: participants },
    });
  }
  return groups;
}

async function mergedConversationData(db, rows) {
  const [canonical] = rows;
  const operationIds = rows.map((row) => row.data.operationId).filter(Boolean);
  let operationId = operationIds.at(-1) || null;
  if (operationIds.length > 1) {
    const operations = await db.query(
      `select id, data
       from public.wigolink_transactions
       where id = any($1::text[])
       order by case
         when coalesce(data->>'status', '') not in ('cancelled', 'refunded', 'released') then 0
         else 1
       end, created_at desc`,
      [operationIds],
    );
    operationId = operations.rows[0]?.id || operationId;
  }
  return {
    ...canonical.data,
    id: canonical.id,
    participantIds: canonical.data.participantIds,
    tripId: canonical.data.tripId,
    operationId,
    createdAt: Math.min(...rows.map((row) => Number(row.data.createdAt || row.created_at?.getTime?.() || Date.now()))),
    lastMessageAt: Math.max(...rows.map((row) => Number(row.data.lastMessageAt || 0))),
    archivedBy: intersection(rows, 'archivedBy'),
    deletedBy: intersection(rows, 'deletedBy'),
    pinnedBy: union(rows, 'pinnedBy'),
    blockedBy: union(rows, 'blockedBy'),
    reportedBy: union(rows, 'reportedBy'),
    reports: uniqueObjects(rows, 'reports'),
    safetyIncidents: uniqueObjects(rows, 'safetyIncidents'),
  };
}

function union(rows, key) {
  return [...new Set(rows.flatMap((row) => Array.isArray(row.data[key]) ? row.data[key] : []))];
}

function intersection(rows, key) {
  const [first = [], ...rest] = rows.map((row) => (
    Array.isArray(row.data[key]) ? row.data[key] : []
  ));
  return [...new Set(first)].filter((value) => rest.every((items) => items.includes(value)));
}

function uniqueObjects(rows, key) {
  const seen = new Set();
  return rows.flatMap((row) => Array.isArray(row.data[key]) ? row.data[key] : [])
    .filter((item) => {
      const identity = item?.id || JSON.stringify(item);
      if (seen.has(identity)) return false;
      seen.add(identity);
      return true;
    });
}
