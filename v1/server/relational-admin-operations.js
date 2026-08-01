const REVIEW_LIMIT = 200;
const DISPUTE_LIMIT = 500;
const WHITELIST_LIMIT = 500;
const RECENT_MESSAGE_LIMIT = 8;

export async function relationalAdminOperationState({ pool }) {
  requirePool(pool);
  const [
    statsResult,
    disputesResult,
    reviewResult,
    pendingKycResult,
    whitelistResult,
  ] = await Promise.all([
    pool.query(
      `select
         (select count(*)::int from public.wigolink_users) as users,
         (select count(*)::int from public.wigolink_listings) as listings,
         (select count(*)::int from public.wigolink_transactions) as transactions,
         (select count(*)::int
            from public.wigolink_transactions
           where data->>'status' = 'released') as released,
         (select count(*)::int
            from public.wigolink_transactions
           where data->>'status' = 'disputed') as disputed,
         (select count(*)::int
            from public.wigolink_disputes
           where coalesce(data->>'status', 'open') = 'open') as open_disputes,
         (select count(*)::int from public.messages where flagged) as flagged_messages,
         (select coalesce(sum(
            case
              when data->'escrow'->>'state' in ('held', 'frozen')
              then coalesce((data->'escrow'->>'amount')::numeric, 0)
              else 0
            end
          ), 0)::float8
            from public.wigolink_transactions) as escrow_held`,
    ),
    pool.query(
      `select data
         from public.wigolink_disputes
        order by created_at desc
        limit $1`,
      [DISPUTE_LIMIT],
    ),
    pool.query(
      `select
         queue.data as item,
         listing.data as listing,
         dispute.data as dispute,
         conversation.data as conversation,
         trip.data as trip,
         operation.data as operation
       from public.wigolink_review_queue queue
       left join public.wigolink_listings listing
         on queue.data->>'type' = 'listing'
        and listing.id = queue.data->>'refId'
       left join public.wigolink_disputes dispute
         on queue.data->>'type' = 'dispute'
        and dispute.id = queue.data->>'refId'
       left join public.wigolink_conversations conversation
         on queue.data->>'type' = 'conversation'
        and conversation.id = queue.data->>'refId'
       left join public.wigolink_trips trip
         on trip.id = conversation.data->>'tripId'
       left join public.wigolink_transactions operation
         on operation.id = conversation.data->>'operationId'
       where coalesce(queue.data->>'status', 'open') = 'open'
       order by queue.created_at desc
       limit $1`,
      [REVIEW_LIMIT],
    ),
    pool.query(
      `select submission.data, member.data as member
         from public.wigolink_kyc_submissions submission
         left join public.wigolink_users member
           on member.id = submission.data->>'userId'
        where submission.data->>'status' = 'pending'
        order by coalesce(
          nullif(submission.data->>'submittedAt', '')::bigint,
          extract(epoch from submission.created_at) * 1000
        ) asc
        limit $1`,
      [REVIEW_LIMIT],
    ),
    pool.query(
      `select data
         from public.wigolink_custom_whitelist
        order by created_at desc
        limit $1`,
      [WHITELIST_LIMIT],
    ),
  ]);

  const reviewQueue = await enrichReviewQueue({
    pool,
    rows: reviewResult.rows,
  });
  const stats = statsResult.rows[0] || {};

  return {
    stats: {
      users: Number(stats.users || 0),
      listings: Number(stats.listings || 0),
      transactions: Number(stats.transactions || 0),
      released: Number(stats.released || 0),
      disputed: Number(stats.disputed || 0),
      openDisputes: Number(stats.open_disputes || 0),
      flaggedMessages: Number(stats.flagged_messages || 0),
      escrowHeld: Number(stats.escrow_held || 0),
    },
    disputes: disputesResult.rows.map((row) => row.data),
    reviewQueue,
    pendingKyc: pendingKycResult.rows.map((row) => ({
      ...row.data,
      user: privateAdminUser(row.member),
    })),
    customWhitelist: whitelistResult.rows.map((row) => row.data),
  };
}

export async function relationalAdminKpis({
  pool,
  locale = 'fr-FR',
  now = Date.now(),
}) {
  requirePool(pool);
  const dayMs = 86_400_000;
  const [totalsResult, monthlyResult] = await Promise.all([
    pool.query(
      `select
         (select count(*)::int from public.wigolink_users) as users,
         (select count(*)::int from public.wigolink_transactions) as transactions,
         (select count(*)::int
            from public.wigolink_transactions
           where data->>'status' = 'released') as released,
         (select count(*)::int from public.wigolink_disputes) as disputes,
         (select count(*)::int
            from public.wigolink_transactions
           where data->>'status' in ('in_transit', 'released', 'disputed', 'refunded'))
           as disputable,
         (select count(*)::int
            from public.wigolink_disputes
           where data->>'status' = 'resolved'
             and nullif(data->>'resolvedAt', '') is not null) as resolved,
         (select count(*)::int
            from public.wigolink_disputes
           where data->>'status' = 'resolved'
             and nullif(data->>'resolvedAt', '') is not null
             and nullif(data->>'resolvedAt', '')::bigint
               - coalesce(nullif(data->>'createdAt', '')::bigint, 0) <= $1)
           as resolved_fast,
         (select count(*)::int
            from (
              select data->>'travelerId'
              from public.wigolink_transactions
              where nullif(data->>'travelerId', '') is not null
              group by data->>'travelerId'
            ) travelers) as traveler_count,
         (select count(*)::int
            from (
              select data->>'travelerId'
              from public.wigolink_transactions
              where nullif(data->>'travelerId', '') is not null
              group by data->>'travelerId'
              having count(*) >= 2
            ) recurring) as recurring_travelers,
         (select count(*)::int from public.messages) as messages,
         (select count(*)::int from public.messages where flagged) as flagged_messages,
         (select min(coalesce(
            nullif(data->>'createdAt', '')::bigint,
            extract(epoch from created_at) * 1000
          ))::float8 from public.wigolink_transactions) as first_transaction_at,
         (select avg(
            (
              coalesce(
                nullif(tx.data->>'createdAt', '')::bigint,
                extract(epoch from tx.created_at) * 1000
              )
              - coalesce(
                nullif(listing.data->>'createdAt', '')::bigint,
                extract(epoch from listing.created_at) * 1000
              )
            ) / 3600000.0
          )::float8
            from public.wigolink_transactions tx
            join public.wigolink_listings listing
              on listing.id = tx.data->>'listingId'
           where coalesce(
             nullif(tx.data->>'createdAt', '')::bigint,
             extract(epoch from tx.created_at) * 1000
           ) >= coalesce(
             nullif(listing.data->>'createdAt', '')::bigint,
             extract(epoch from listing.created_at) * 1000
           )) as avg_match_hours`,
      [7 * dayMs],
    ),
    pool.query(
      `select
         bucket,
         count(tx.id)::int as count
       from generate_series(5, 0, -1) bucket
       left join public.wigolink_transactions tx
         on tx.data->>'status' = 'released'
        and nullif(tx.data->'escrow'->>'releasedAt', '') is not null
        and nullif(tx.data->'escrow'->>'releasedAt', '')::bigint
          >= $1::bigint - (bucket + 1) * $2::bigint
        and nullif(tx.data->'escrow'->>'releasedAt', '')::bigint
          < $1::bigint - bucket * $2::bigint
       group by bucket
       order by bucket desc`,
      [now, 30 * dayMs],
    ),
  ]);
  const totals = totalsResult.rows[0] || {};
  const transactions = Number(totals.transactions || 0);
  const released = Number(totals.released || 0);
  const disputes = Number(totals.disputes || 0);
  const disputable = Number(totals.disputable || 0);
  const resolved = Number(totals.resolved || 0);
  const resolvedFast = Number(totals.resolved_fast || 0);
  const travelerCount = Number(totals.traveler_count || 0);
  const recurringTravelers = Number(totals.recurring_travelers || 0);
  const messages = Number(totals.messages || 0);
  const flaggedMessages = Number(totals.flagged_messages || 0);
  const firstTransactionAt = Number(totals.first_transaction_at || now);
  const monthsElapsed = Math.max(1, (now - firstTransactionAt) / (30 * dayMs));

  return {
    kpis: {
      transactionsPerMonth: {
        value: Math.round((released / monthsElapsed) * 10) / 10,
        target: 150,
        direction: 'above',
        monthly: monthlyResult.rows.map((row) => ({
          label: new Date(now - Number(row.bucket) * 30 * dayMs)
            .toLocaleDateString(locale, { month: 'short' }),
          count: Number(row.count || 0),
        })),
      },
      disputeRate: {
        value: disputable ? disputes / disputable : 0,
        target: 0.05,
        direction: 'below',
      },
      resolutionRate: {
        value: resolved ? resolvedFast / resolved : null,
        target: 0.9,
        direction: 'above',
        sampleSize: resolved,
      },
      recurringTravelers: {
        value: travelerCount ? recurringTravelers / travelerCount : 0,
        target: 0.4,
        direction: 'above',
        sampleSize: travelerCount,
      },
      desintermediationRate: {
        value: messages ? flaggedMessages / messages : 0,
        target: 0.15,
        direction: 'below',
        sampleSize: messages,
      },
      avgMatchHours: {
        value: totals.avg_match_hours === null
          ? null
          : Number(totals.avg_match_hours),
        target: 72,
        direction: 'below',
      },
      nps: {
        value: null,
        target: 50,
        direction: 'above',
        note: 'Necessite un sondage post-transaction - non instrumente',
      },
    },
    totals: {
      transactions,
      released,
      disputes,
      users: Number(totals.users || 0),
    },
  };
}

async function enrichReviewQueue({ pool, rows }) {
  const conversationIds = rows
    .filter((row) => row.item?.type === 'conversation' && row.conversation?.id)
    .map((row) => row.conversation.id);
  const messagesByConversation = await recentConversationMessages({
    pool,
    conversationIds,
  });
  const users = await reviewUsers({
    pool,
    rows,
    messagesByConversation,
  });

  return rows.map((row) => {
    const item = row.item;
    if (item?.type === 'listing') {
      return { ...item, listing: row.listing || null };
    }
    if (item?.type === 'dispute') {
      return { ...item, dispute: row.dispute || null };
    }
    if (item?.type !== 'conversation') return item;
    return {
      ...item,
      conversation: conversationModerationView({
        conversation: row.conversation,
        trip: row.trip,
        operation: row.operation,
        messages: messagesByConversation.get(row.conversation?.id) || [],
        users,
      }),
    };
  });
}

async function recentConversationMessages({ pool, conversationIds }) {
  if (conversationIds.length === 0) return new Map();
  const result = await pool.query(
    `select data
       from (
         select
           data,
           row_number() over (
             partition by conversation_id
             order by at desc
           ) as position
         from public.messages
         where conversation_id = any($1::text[])
       ) recent
      where position <= $2
      order by coalesce((data->>'at')::bigint, 0) asc`,
    [conversationIds, RECENT_MESSAGE_LIMIT],
  );
  const grouped = new Map();
  for (const row of result.rows) {
    const message = row.data;
    const id = message?.conversationId;
    if (!id) continue;
    const messages = grouped.get(id) || [];
    messages.push(message);
    grouped.set(id, messages);
  }
  return grouped;
}

async function reviewUsers({ pool, rows, messagesByConversation }) {
  const ids = new Set();
  for (const row of rows) {
    for (const id of row.conversation?.participantIds || []) ids.add(id);
    for (const report of row.conversation?.reports || []) ids.add(report.reporterId);
    for (const incident of row.conversation?.safetyIncidents || []) ids.add(incident.userId);
  }
  for (const messages of messagesByConversation.values()) {
    for (const message of messages) ids.add(message.from);
  }
  ids.delete(undefined);
  ids.delete(null);
  ids.delete('');
  if (ids.size === 0) return new Map();
  const result = await pool.query(
    `select id, data
       from public.wigolink_users
      where id = any($1::text[])`,
    [[...ids]],
  );
  return new Map(result.rows.map((row) => [row.id, publicUser(row.data)]));
}

function conversationModerationView({
  conversation,
  trip,
  operation,
  messages,
  users,
}) {
  if (!conversation) return null;
  const reports = [...(conversation.reports || [])]
    .sort((left, right) => Number(right.at || 0) - Number(left.at || 0))
    .map((report) => ({
      ...report,
      reporter: users.get(report.reporterId) || null,
    }));
  const incidents = [...(conversation.safetyIncidents || [])]
    .sort((left, right) => Number(right.at || 0) - Number(left.at || 0))
    .slice(0, 12)
    .map((incident) => ({
      ...incident,
      user: users.get(incident.userId) || null,
    }));
  const projectedMessages = messages.map((message) => ({
    ...message,
    fromUser: message.from ? users.get(message.from) || null : null,
  }));
  return {
    id: conversation.id,
    createdAt: conversation.createdAt,
    updatedAt: conversation.lastMessageAt || conversation.createdAt,
    contextType: operation ? 'operation' : trip ? 'trip' : 'direct',
    context: conversationContext({ trip, operation }),
    participants: (conversation.participantIds || [])
      .map((id) => users.get(id))
      .filter(Boolean),
    reportCount: reports.length,
    reports,
    safetyIncidents: incidents,
    messages: projectedMessages,
    lastMessagePreview: projectedMessages.at(-1)?.text || null,
    moderationStatus: conversation.moderationStatus || 'pending',
  };
}

function conversationContext({ trip, operation }) {
  if (operation) {
    return {
      type: 'operation',
      label: operation.title || 'Operation en cours',
      detail: operation.operationStatus || operation.status || 'en cours',
      href: `/operations/${operation.id}`,
    };
  }
  if (trip) {
    return {
      type: 'trip',
      label: `${trip.from} -> ${trip.to}`,
      detail: trip.departureDate || trip.date || null,
      href: `/trajets/${trip.id}`,
    };
  }
  return {
    type: 'direct',
    label: 'Discussion directe',
    detail: null,
    href: null,
  };
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    city: user.city,
    kycStatus: user.kycStatus,
    rating: user.rating,
    ratingCount: user.ratingCount,
    completed: user.completed,
    cancelRate: user.cancelRate,
    badges: user.badges,
    photoUrl: user.photoUrl || null,
    isAdmin: !!user.isAdmin,
    createdAt: user.createdAt,
    onboardingDone: !!user.settings?.onboardingDone,
    emailVerified: !!user.emailVerified,
  };
}

function privateAdminUser(user) {
  if (!user) return null;
  return {
    name: user.name,
    email: user.email,
    createdAt: user.createdAt,
    kycStatus: user.kycStatus,
  };
}

function requirePool(pool) {
  if (!pool || typeof pool.query !== 'function') {
    throw new Error('Un pool Postgres est requis.');
  }
}
