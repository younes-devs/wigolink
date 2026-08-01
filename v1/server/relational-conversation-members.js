export function relationalConversationMembersEnabled(env = process.env) {
  return env.RELATIONAL_CONVERSATION_MEMBERS === 'true';
}

export async function ensureConversationMembers(
  client,
  conversation,
  { now = Date.now() } = {},
) {
  const participantIds = [...new Set(
    Array.isArray(conversation?.participantIds)
      ? conversation.participantIds.filter(Boolean)
      : [],
  )];
  if (!conversation?.id || !participantIds.length) return;
  const createdAt = finiteTimestamp(conversation.createdAt, now);
  for (const userId of participantIds) {
    await client.query(
      `insert into public.wigolink_conversation_members (
         conversation_id,
         user_id,
         archived,
         pinned,
         deleted,
         blocked,
         created_at,
         updated_at
       )
       values (
         $1,
         $2,
         $3,
         $4,
         $5,
         $6,
         to_timestamp($7 / 1000.0),
         now()
       )
       on conflict (conversation_id, user_id) do nothing`,
      [
        conversation.id,
        String(userId),
        includes(conversation.archivedBy, userId),
        includes(conversation.pinnedBy, userId),
        includes(conversation.deletedBy, userId),
        includes(conversation.blockedBy, userId),
        createdAt,
      ],
    );
  }
}

function includes(values, id) {
  return Array.isArray(values) && values.includes(id);
}

function finiteTimestamp(value, fallback) {
  const timestamp = Number(value);
  return Number.isFinite(timestamp) && timestamp > 0
    ? timestamp
    : fallback();
}
