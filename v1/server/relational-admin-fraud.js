const SIGNAL_LIMIT = 500;

export async function relationalAdminFraudState({ pool }) {
  requirePool(pool);
  const [
    linkedResult,
    pairsResult,
    flaggedResult,
    cancellationResult,
    disputesResult,
    kycResult,
  ] = await Promise.all([
    pool.query(
      `with member_signals as (
         select
           'phone'::text as signal,
           data->>'phone' as value,
           data
         from public.wigolink_users
         where not coalesce((data->>'isAdmin')::boolean, false)
           and nullif(data->>'deletedAt', '') is null
           and nullif(data->>'phone', '') is not null
         union all
         select
           'ip'::text as signal,
           data->>'registerIp' as value,
           data
         from public.wigolink_users
         where not coalesce((data->>'isAdmin')::boolean, false)
           and nullif(data->>'deletedAt', '') is null
           and nullif(data->>'registerIp', '') is not null
       )
       select
         signal,
         value,
         jsonb_agg(jsonb_build_object(
           'id', data->>'id',
           'name', data->>'name',
           'email', data->>'email',
           'createdAt', coalesce((data->>'createdAt')::bigint, 0)
         ) order by coalesce((data->>'createdAt')::bigint, 0)) as users
       from member_signals
       group by signal, value
       having count(*) > 1
       order by count(*) desc
       limit $1`,
      [SIGNAL_LIMIT],
    ),
    pool.query(
      `select
         least(tx.data->>'senderId', tx.data->>'travelerId') as first_user_id,
         greatest(tx.data->>'senderId', tx.data->>'travelerId') as second_user_id,
         first_member.data->>'name' as first_name,
         second_member.data->>'name' as second_name,
         count(*)::int as transaction_count,
         count(*) filter (
           where tx.data->>'status' = 'disputed'
              or exists (
                select 1
                from public.wigolink_disputes d
                where d.data->>'txId' = tx.id
              )
         )::int as disputed_count,
         coalesce(sum((tx.data->'escrow'->>'amount')::numeric), 0)::float8
           as total_value_eur
       from public.wigolink_transactions tx
       left join public.wigolink_users first_member
         on first_member.id = least(tx.data->>'senderId', tx.data->>'travelerId')
       left join public.wigolink_users second_member
         on second_member.id = greatest(tx.data->>'senderId', tx.data->>'travelerId')
       where nullif(tx.data->>'senderId', '') is not null
         and nullif(tx.data->>'travelerId', '') is not null
       group by
         least(tx.data->>'senderId', tx.data->>'travelerId'),
         greatest(tx.data->>'senderId', tx.data->>'travelerId'),
         first_member.data->>'name',
         second_member.data->>'name'
       having count(*) >= 2
       order by transaction_count desc
       limit $1`,
      [SIGNAL_LIMIT],
    ),
    pool.query(
      `select
         message.from_id as user_id,
         member.data->>'name' as name,
         count(*)::int as count
       from public.messages message
       left join public.wigolink_users member on member.id = message.from_id
       where message.flagged
         and nullif(message.from_id, '') is not null
       group by message.from_id, member.data->>'name'
       order by count desc
       limit $1`,
      [SIGNAL_LIMIT],
    ),
    pool.query(
      `select data
       from public.wigolink_users
       where not coalesce((data->>'isAdmin')::boolean, false)
         and nullif(data->>'deletedAt', '') is null
         and coalesce((data->>'completed')::int, 0) >= 3
         and coalesce((data->>'cancelRate')::numeric, 0) > 0.2
       order by coalesce((data->>'cancelRate')::numeric, 0) desc
       limit $1`,
      [SIGNAL_LIMIT],
    ),
    pool.query(
      `select
         participant.user_id,
         member.data->>'name' as name,
         count(*)::int as dispute_count
       from public.wigolink_disputes dispute
       join public.wigolink_transactions tx
         on tx.id = dispute.data->>'txId'
       cross join lateral (
         select distinct user_id
         from (
           values
             (tx.data->>'senderId'),
             (tx.data->>'travelerId'),
             (tx.data->>'recipientId')
         ) as ids(user_id)
         where nullif(user_id, '') is not null
       ) participant
       left join public.wigolink_users member on member.id = participant.user_id
       group by participant.user_id, member.data->>'name'
       having count(*) >= 2
       order by dispute_count desc
       limit $1`,
      [SIGNAL_LIMIT],
    ),
    pool.query(
      `select
         submission.data->>'userId' as user_id,
         member.data->>'name' as name,
         member.data->>'kycStatus' as current_status,
         count(*)::int as rejection_count
       from public.wigolink_kyc_submissions submission
       left join public.wigolink_users member
         on member.id = submission.data->>'userId'
       where submission.data->>'status' in ('rejected', 'refused')
       group by
         submission.data->>'userId',
         member.data->>'name',
         member.data->>'kycStatus'
       having count(*) >= 2
       order by rejection_count desc
       limit $1`,
      [SIGNAL_LIMIT],
    ),
  ]);

  const details = {
    linkedAccounts: linkedResult.rows.map((row) => ({
      signal: row.signal,
      value: row.value,
      users: row.users || [],
    })),
    repeatPairs: pairsResult.rows.map((row) => ({
      users: [
        { id: row.first_user_id, name: row.first_name || '?' },
        { id: row.second_user_id, name: row.second_name || '?' },
      ],
      transactionCount: Number(row.transaction_count || 0),
      disputedCount: Number(row.disputed_count || 0),
      totalValueEur: Math.round(Number(row.total_value_eur || 0) * 100) / 100,
    })),
    flaggedMessaging: flaggedResult.rows.map((row) => ({
      userId: row.user_id,
      name: row.name || '?',
      count: Number(row.count || 0),
    })),
    abnormalCancel: cancellationResult.rows.map((row) => ({
      id: row.data.id,
      name: row.data.name,
      completed: Number(row.data.completed || 0),
      cancelRate: Number(row.data.cancelRate || 0),
    })),
    disputeProne: disputesResult.rows.map((row) => ({
      userId: row.user_id,
      name: row.name || '?',
      disputeCount: Number(row.dispute_count || 0),
    })),
    kycRepeatRejections: kycResult.rows.map((row) => ({
      userId: row.user_id,
      name: row.name || '?',
      rejectionCount: Number(row.rejection_count || 0),
      currentStatus: row.current_status,
    })),
  };

  return {
    details,
    summary: {
      linkedAccounts: details.linkedAccounts.length,
      repeatPairs: details.repeatPairs.filter(
        (pair) => pair.transactionCount >= 3,
      ).length,
      flaggedMessaging: details.flaggedMessaging.length,
      abnormalCancel: details.abnormalCancel.length,
      disputeProne: details.disputeProne.length,
      kycRepeatRejections: details.kycRepeatRejections.length,
    },
  };
}

function requirePool(pool) {
  if (!pool || typeof pool.query !== 'function') {
    throw new Error('Un pool Postgres est requis.');
  }
}
