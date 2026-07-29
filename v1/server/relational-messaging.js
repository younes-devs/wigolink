const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 200;

export function relationalMessageReadsEnabled(env = process.env) {
  return env.RELATIONAL_MESSAGE_READS === 'true';
}

export async function listRelationalConversations({ pool, user, query = {}, today }) {
  const limit = boundedLimit(query.limit);
  const offset = boundedOffset(query.offset);
  const result = await pool.query(
    `select c.data as conversation, other.data as other, trip.data as trip, operation.data as operation,
       last_message.data as last_message,
       coalesce(unread.count, 0)::int as unread_count
     from public.wigofly_conversations c
     left join lateral (
       select u.data from public.wigofly_users u
       where u.id <> $1 and c.data->'participantIds' ? u.id
       limit 1
     ) other on true
     left join public.wigofly_trips trip on trip.id = c.data->>'tripId'
     left join public.wigofly_transactions operation on operation.id = c.data->>'operationId'
     left join lateral (
       select m.data from public.messages m
       where m.conversation_id = c.id
         and coalesce((m.data->>'hiddenForParticipants')::boolean, false) = false
       order by m.at desc
       limit 1
     ) last_message on true
     left join lateral (
       select count(*)::int as count from public.messages m
       where m.conversation_id = c.id
         and coalesce((m.data->>'hiddenForParticipants')::boolean, false) = false
         and m.from_id <> $1
         and not (coalesce(m.data->'readBy', '[]'::jsonb) ? $1)
     ) unread on true
     where c.data->'participantIds' ? $1
       and not (coalesce(c.data->'deletedBy', '[]'::jsonb) ? $1)
     order by coalesce((c.data->>'lastMessageAt')::bigint, extract(epoch from c.created_at) * 1000) desc
     limit $2 offset $3`,
    [user.id, limit, offset]
  );
  let conversations = result.rows.map((row) => conversationView(row, user, today));
  conversations = applyConversationFilters(conversations, query);
  return {
    conversations,
    page: { limit, offset, hasMore: result.rows.length === limit, nextOffset: result.rows.length === limit ? offset + limit : null },
  };
}

export async function relationalConversation({ pool, user, id, query = {}, today, includeMessages = false }) {
  const result = await pool.query(
    `select c.data as conversation, other.data as other, trip.data as trip, operation.data as operation,
       last_message.data as last_message,
       coalesce(unread.count, 0)::int as unread_count
     from public.wigofly_conversations c
     left join lateral (
       select u.data from public.wigofly_users u
       where u.id <> $1 and c.data->'participantIds' ? u.id
       limit 1
     ) other on true
     left join public.wigofly_trips trip on trip.id = c.data->>'tripId'
     left join public.wigofly_transactions operation on operation.id = c.data->>'operationId'
     left join lateral (
       select m.data from public.messages m
       where m.conversation_id = c.id
         and coalesce((m.data->>'hiddenForParticipants')::boolean, false) = false
       order by m.at desc limit 1
     ) last_message on true
     left join lateral (
       select count(*)::int as count from public.messages m
       where m.conversation_id = c.id
         and coalesce((m.data->>'hiddenForParticipants')::boolean, false) = false
         and m.from_id <> $1
         and not (coalesce(m.data->'readBy', '[]'::jsonb) ? $1)
     ) unread on true
     where c.id = $2 and c.data->'participantIds' ? $1
       and not (coalesce(c.data->'deletedBy', '[]'::jsonb) ? $1)`,
    [user.id, id]
  );
  const row = result.rows[0];
  if (!row) return null;
  const conversation = conversationView(row, user, today);
  if (!includeMessages) return { conversation };
  const messagesPage = await relationalConversationMessages({ pool, conversationId: id, query });
  return { conversation, ...messagesPage };
}

export async function relationalConversationMessages({ pool, conversationId, query = {} }) {
  const limit = boundedLimit(query.limit || 50);
  const before = positiveTimestamp(query.before);
  const after = positiveTimestamp(query.after);
  const q = String(query.q || '').trim();
  const params = [conversationId];
  const where = [
    'm.conversation_id = $1',
    "coalesce((m.data->>'hiddenForParticipants')::boolean, false) = false",
  ];
  if (before) {
    params.push(before);
    where.push(`extract(epoch from m.at) * 1000 < $${params.length}`);
  }
  if (after) {
    params.push(after);
    where.push(`extract(epoch from m.at) * 1000 > $${params.length}`);
  }
  if (q) {
    params.push(`%${q}%`);
    where.push(`m.text ilike $${params.length}`);
  }
  params.push(limit + 1);
  const result = await pool.query(
    `select m.data from public.messages m
     where ${where.join(' and ')}
     order by m.at ${after ? 'asc' : 'desc'}
     limit $${params.length}`,
    params
  );
  const hasMore = result.rows.length > limit;
  const selected = result.rows.slice(0, limit).map((row) => messageView(row.data));
  const messages = after ? selected : selected.reverse();
  return {
    messages,
    page: {
      limit,
      total: null,
      hasMore,
      nextBefore: !after && hasMore ? messages[0]?.at || null : null,
      nextAfter: after && hasMore ? messages.at(-1)?.at || null : null,
      q,
    },
  };
}

export async function relationalAdminMessageArchive({
  pool,
  userId,
  offset = 0,
  limit = 50,
}) {
  const safeOffset = boundedOffset(offset);
  const safeLimit = boundedLimit(limit);
  const conversationsResult = await pool.query(
    `select
       c.data as conversation,
       count(m.id)::int as message_count,
       coalesce(reports.data, '[]'::jsonb) as reports
     from public.wigofly_conversations c
     left join public.messages m on m.conversation_id = c.id
     left join lateral (
       select jsonb_agg(report.data order by report.created_at desc) as data
       from public.wigofly_conversation_reports report
       where report.conversation_id = c.id
     ) reports on true
     where c.data->'participantIds' ? $1
     group by c.id, c.data, c.created_at, reports.data
     order by coalesce(
       (c.data->>'lastMessageAt')::bigint,
       extract(epoch from c.created_at) * 1000
     ) desc`,
    [userId],
  );
  const messagesResult = await pool.query(
    `select m.data, count(*) over()::int as total
     from public.messages m
     join public.wigofly_conversations c on c.id = m.conversation_id
     where c.data->'participantIds' ? $1
     order by m.at desc
     limit $2 offset $3`,
    [userId, safeLimit, safeOffset],
  );
  return {
    conversations: conversationsResult.rows.map((row) => ({
      ...(row.conversation || {}),
      reports: Array.isArray(row.reports) ? row.reports : [],
      messageCount: Number(row.message_count || 0),
    })),
    messages: messagesResult.rows.map((row) => row.data),
    total: Number(messagesResult.rows[0]?.total || 0),
  };
}

function conversationView(row, viewer, today) {
  const conversation = row.conversation || {};
  const trip = row.trip || null;
  const operation = operationView(row.operation, trip);
  const lastMessage = row.last_message ? messageView(row.last_message) : null;
  const unread = Number(row.unread_count || 0);
  const archived = (conversation.archivedBy || []).includes(viewer.id);
  const pinned = (conversation.pinnedBy || []).includes(viewer.id);
  const completed = operation
    ? ['termine', 'released', 'refunded', 'cancelled'].includes(operation.operationStatus || operation.status)
    : !!trip && (trip.departureDate || trip.date || '') < today;
  const contextType = operation ? 'operation' : trip ? 'trip' : 'direct';
  const actionHref = operation ? `/operations/${operation.id}` : trip ? `/trajets/${trip.id}` : null;
  const actionLabel = actionHref ? (operation ? 'Voir l operation' : 'Voir le trajet') : null;
  const lastMessageAt = lastMessage?.at || conversation.lastMessageAt || conversation.createdAt || Date.now();
  const lastMessagePreview = lastMessage?.flagged
    ? 'Message signale par securite'
    : (lastMessage?.text || (lastMessage?.location ? 'Localisation partagee' : lastMessage?.attachments?.length ? 'Photo jointe' : trip ? 'Conversation liee a un trajet' : operation ? 'Conversation liee a une operation' : 'Nouvelle conversation'));
  return {
    ...conversation,
    participants: [],
    other: publicUser(row.other),
    otherOnline: false,
    otherLastSeenAt: null,
    lastMessage,
    lastMessageAt,
    lastMessagePreview,
    unread,
    unreadCount: unread,
    status: archived ? 'archived' : completed ? 'completed' : 'active',
    archived,
    pinned,
    actionRequired: false,
    actionLabel,
    actionHref,
    contextType,
    context: contextView({ trip, operation }),
    updatedAt: lastMessageAt,
    trip: tripView(trip),
    operation,
  };
}

function operationView(operation, trip) {
  if (!operation) return null;
  return {
    ...operation,
    operationStatus: operation.operationStatus || operation.status || 'attente_confirmation',
    title: trip ? `${trip.from} -> ${trip.to}` : operation.title || operation.id,
    price: Number(operation.price || operation.escrow?.travelerPay || trip?.price || 0),
    currency: operation.currency || trip?.currency || 'EUR',
  };
}

function tripView(trip) {
  if (!trip) return null;
  return {
    ...trip,
    departureDate: trip.departureDate || trip.date,
    transportMode: trip.transportMode === 'car' ? 'car' : 'plane',
    price: Number(trip.price ?? trip.proposedPrice ?? trip.travelerPay ?? 25),
    currency: trip.currency || 'EUR',
  };
}

function contextView({ trip, operation }) {
  if (operation) return { type: 'operation', label: operation.title || 'Operation en cours', detail: operation.operationStatus || operation.status || 'en cours', href: `/operations/${operation.id}` };
  if (trip) return { type: 'trip', label: `${trip.from} -> ${trip.to}`, detail: trip.departureDate || trip.date || null, href: `/trajets/${trip.id}` };
  return { type: 'direct', label: 'Discussion directe', detail: null, href: null };
}

function messageView(message) {
  if (!message) return null;
  return {
    ...message,
    attachments: (message.attachments || []).map((attachment) => {
      const { dataUrl, storagePath, ...safe } = attachment;
      return {
        ...safe,
        url: safe.url || `/conversations/${message.conversationId}/messages/${message.id}/attachments/${attachment.id}`,
      };
    }),
    type: message.type || (message.flagged ? 'warning' : 'text'),
    deliveryStatus: message.deliveryStatus || 'sent',
    createdAt: message.createdAt || message.at,
    updatedAt: message.updatedAt || message.at,
  };
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id, name: user.name, city: user.city, kycStatus: user.kycStatus, rating: user.rating,
    ratingCount: user.ratingCount, completed: user.completed, cancelRate: user.cancelRate,
    badges: user.badges, photoUrl: user.photoUrl || null, isAdmin: !!user.isAdmin,
    createdAt: user.createdAt, onboardingDone: !!user.settings?.onboardingDone,
    emailVerified: !!user.emailVerified,
  };
}

function applyConversationFilters(conversations, query) {
  const filter = String(query.filter || 'all');
  const q = String(query.q || '').trim().toLowerCase();
  return conversations
    .filter((item) => query.includeArchived === '1' || filter === 'archived' || !item.archived)
    .filter((item) => {
      if (filter === 'unread') return item.unreadCount > 0;
      if (filter === 'action') return item.actionRequired;
      if (filter === 'pinned') return item.pinned;
      if (filter === 'active') return ['active', 'waiting_user', 'waiting_other'].includes(item.status);
      if (filter === 'done') return item.status === 'completed' || item.status === 'archived';
      if (filter === 'archived') return item.archived;
      return true;
    })
    .filter((item) => !q || `${item.other?.name || ''} ${item.lastMessagePreview || ''} ${item.context?.label || ''} ${item.context?.detail || ''}`.toLowerCase().includes(q))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || Number(b.lastMessageAt) - Number(a.lastMessageAt));
}

function boundedLimit(value) {
  const number = Number(value || DEFAULT_LIMIT);
  return Math.max(1, Math.min(MAX_LIMIT, Number.isFinite(number) ? Math.floor(number) : DEFAULT_LIMIT));
}

function boundedOffset(value) {
  const number = Number(value || 0);
  return Math.max(0, Number.isFinite(number) ? Math.floor(number) : 0);
}

function positiveTimestamp(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) && number > 0 ? number : null;
}
