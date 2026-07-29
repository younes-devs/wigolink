export async function relationalAdminFraudState({ pool }) {
  const [pairsResult, disputesResult] = await Promise.all([
    pool.query(
      `select
         least(data->>'senderId', data->>'travelerId') as first_user_id,
         greatest(data->>'senderId', data->>'travelerId') as second_user_id,
         count(*)::int as transaction_count,
         count(*) filter (
           where data->>'status' = 'disputed'
              or exists (
                select 1
                from public.wigofly_disputes d
                where d.data->>'txId' = tx.id
              )
         )::int as disputed_count,
         coalesce(sum((data->'escrow'->>'amount')::numeric), 0)::float8
           as total_value_eur
       from public.wigofly_transactions tx
       where nullif(data->>'senderId', '') is not null
         and nullif(data->>'travelerId', '') is not null
       group by
         least(data->>'senderId', data->>'travelerId'),
         greatest(data->>'senderId', data->>'travelerId')
       having count(*) >= 2
       order by transaction_count desc
       limit 500`,
    ),
    pool.query(
      `select participant.user_id, count(*)::int as dispute_count
       from public.wigofly_disputes d
       join public.wigofly_transactions tx
         on tx.id = d.data->>'txId'
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
       group by participant.user_id
       having count(*) >= 2
       order by dispute_count desc
       limit 500`,
    ),
  ]);

  return {
    repeatPairs: pairsResult.rows.map((row) => ({
      firstUserId: row.first_user_id,
      secondUserId: row.second_user_id,
      transactionCount: Number(row.transaction_count || 0),
      disputedCount: Number(row.disputed_count || 0),
      totalValueEur: Number(row.total_value_eur || 0),
    })),
    disputeCounts: Object.fromEntries(
      disputesResult.rows.map((row) => [
        row.user_id,
        Number(row.dispute_count || 0),
      ]),
    ),
  };
}
