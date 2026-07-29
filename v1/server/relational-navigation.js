export function relationalNavigationEnabled(env = process.env) {
  return env.RELATIONAL_MESSAGE_READS === 'true'
    || env.RELATIONAL_MESSAGE_WRITES === 'true'
    || env.RELATIONAL_OPERATION_READS === 'true'
    || env.RELATIONAL_OPERATION_WRITES === 'true';
}

export async function relationalNavigationSummary({
  pool,
  user,
  memberStateEnabled = false,
}) {
  const messageJoin = memberStateEnabled
    ? `join public.wigofly_conversation_members member
         on member.conversation_id = c.id and member.user_id = $1`
    : '';
  const messageMembership = memberStateEnabled
    ? 'and not member.deleted'
    : `and c.data->'participantIds' ? $1
       and not (coalesce(c.data->'deletedBy', '[]'::jsonb) ? $1)`;
  const unreadFilter = memberStateEnabled
    ? `and m.at > coalesce(member.last_read_at, 'epoch'::timestamptz)`
    : `and not (coalesce(m.data->'readBy', '[]'::jsonb) ? $1)`;
  const result = await pool.query(
    `select
       (
         select count(distinct c.id)::int
         from public.wigofly_conversations c
         ${messageJoin}
         join public.messages m on m.conversation_id = c.id
         where true
           ${messageMembership}
           and coalesce((m.data->>'hiddenForParticipants')::boolean, false) = false
           and m.from_id <> $1
           ${unreadFilter}
       ) as messages_unread,
       (
         select count(*)::int
         from public.wigofly_transactions tx
         where (
           tx.data->>'senderId' = $1
           or tx.data->>'travelerId' = $1
           or tx.data->>'recipientId' = $1
         )
           and coalesce(tx.data->>'status', '') not in (
             'released', 'refunded', 'cancelled'
           )
           and (
             (
               coalesce(tx.data->>'operationStatus', '') = 'attente_confirmation'
               and tx.data->>'travelerId' = $1
             )
             or (
               coalesce(
                 nullif(tx.data->>'operationStatus', ''),
                 case when tx.data->>'status' = 'accepted'
                   then 'paiement_requis' else tx.data->>'status' end
               ) = 'paiement_requis'
               and tx.data->>'senderId' = $1
             )
             or (
               tx.data->>'operationStatus' = 'paye'
               and (
                 (
                   tx.data->'securityCodes'->'pickup'->>'issuedAt' is not null
                   and tx.data->>'senderId' = $1
                 )
                 or (
                   tx.data->'securityCodes'->'pickup'->>'issuedAt' is null
                   and tx.data->>'travelerId' = $1
                 )
               )
             )
             or (
               tx.data->>'operationStatus' = 'en_transport'
               and (
                 (
                   tx.data->'securityCodes'->'delivery'->>'issuedAt' is not null
                   and tx.data->>'travelerId' = $1
                 )
                 or (
                   tx.data->'securityCodes'->'delivery'->>'issuedAt' is null
                   and tx.data->>'senderId' = $1
                 )
               )
             )
             or tx.data->>'operationStatus' = 'litige'
           )
       ) as operations_action_required`,
    [user.id],
  );
  return {
    messagesUnread: Number(result.rows[0]?.messages_unread || 0),
    operationsActionRequired: Number(
      result.rows[0]?.operations_action_required || 0,
    ),
  };
}

export function operationActionRequired(transaction, userId) {
  const status = transaction.operationStatus
    || (transaction.status === 'accepted'
      ? 'paiement_requis'
      : transaction.status);
  if (status === 'attente_confirmation') {
    return transaction.travelerId === userId;
  }
  if (status === 'paiement_requis') return transaction.senderId === userId;
  if (status === 'paye') {
    return transaction.securityCodes?.pickup?.issuedAt
      ? transaction.senderId === userId
      : transaction.travelerId === userId;
  }
  if (status === 'en_transport') {
    return transaction.securityCodes?.delivery?.issuedAt
      ? transaction.travelerId === userId
      : transaction.senderId === userId;
  }
  if (status === 'litige') {
    return [
      transaction.senderId,
      transaction.travelerId,
      transaction.recipientId,
    ].includes(userId);
  }
  return false;
}
