import { transactionParticipantFilter } from './relational-sql.js';

export async function relationalMemberRecords({ pool, userId, limit = null }) {
  const boundedLimit = limit === null
    ? null
    : Math.max(1, Math.min(500, Number(limit) || 100));
  const [result, totalsResult] = await Promise.all([
    pool.query(
    `select
       coalesce((
         select jsonb_agg(t.data order by t.created_at desc)
         from (
           select data, created_at
           from public.wigolink_trips
           where data->>'travelerId' = $1
           order by created_at desc
           limit $2
         ) t
       ), '[]'::jsonb) as trips,
       coalesce((
         select jsonb_agg(l.data order by l.created_at desc)
         from (
           select data, created_at
           from public.wigolink_listings
           where data->>'senderId' = $1
           order by created_at desc
           limit $2
         ) l
       ), '[]'::jsonb) as listings,
       coalesce((
         select jsonb_agg(tx.data order by tx.created_at desc)
         from (
           select data, created_at
           from public.wigolink_transactions tx
           where ${transactionParticipantFilter('$1')}
           order by created_at desc
           limit $2
         ) tx
       ), '[]'::jsonb) as transactions,
       coalesce((
         select jsonb_agg(d.data order by d.created_at desc)
         from (
           select data, created_at
           from public.wigolink_disputes d
           where d.data->>'openedBy' = $1
              or exists (
                select 1
                from public.wigolink_transactions tx
                where tx.id = d.data->>'txId'
                  and ${transactionParticipantFilter('$1')}
              )
           order by created_at desc
           limit $2
         ) d
       ), '[]'::jsonb) as disputes,
       coalesce((
         select jsonb_agg(
           jsonb_build_object(
             'id', n.id,
             'userId', n.user_id,
             'txId', n.tx_id,
             'type', n.type,
             'section', n.section,
             'key', n.key,
             'params', n.params,
             'text', n.text,
             'read', n.read,
             'at', extract(epoch from n.at) * 1000
           )
           order by n.at desc
         )
         from (
           select *
           from public.notifications
           where user_id = $1
           order by at desc
           limit $2
         ) n
       ), '[]'::jsonb) as notifications,
       coalesce((
         select jsonb_agg(queue.data order by queue.created_at desc)
         from (
           select data, created_at
           from public.wigolink_review_queue
           where data->>'type' = 'safety_appeal'
             and data->>'userId' = $1
           order by created_at desc
           limit $2
         ) queue
       ), '[]'::jsonb) as safety_appeals`,
    [userId, boundedLimit],
    ),
    boundedLimit === null ? Promise.resolve(null) : pool.query(
      `select
         (select count(*)::int from public.wigolink_trips
          where data->>'travelerId' = $1) as trips,
         (select count(*)::int from public.wigolink_listings
          where data->>'senderId' = $1) as listings,
         (select count(*)::int from public.wigolink_transactions tx
          where ${transactionParticipantFilter('$1')}) as transactions,
         (select count(*)::int from public.wigolink_disputes d
          where d.data->>'openedBy' = $1
             or exists (
               select 1 from public.wigolink_transactions tx
               where tx.id = d.data->>'txId'
                 and ${transactionParticipantFilter('$1')}
             )) as disputes,
         (select count(*)::int from public.notifications
          where user_id = $1) as notifications,
         (select count(*)::int from public.wigolink_review_queue
          where data->>'type' = 'safety_appeal'
            and data->>'userId' = $1) as safety_appeals`,
      [userId],
    ),
  ]);
  const row = result.rows[0] || {};
  const totals = totalsResult?.rows[0] || null;
  return {
    trips: asArray(row.trips),
    listings: asArray(row.listings),
    transactions: asArray(row.transactions),
    disputes: asArray(row.disputes),
    notifications: asArray(row.notifications),
    safetyAppeals: asArray(row.safety_appeals),
    totals: totals ? {
      trips: Number(totals.trips || 0),
      listings: Number(totals.listings || 0),
      transactions: Number(totals.transactions || 0),
      disputes: Number(totals.disputes || 0),
      notifications: Number(totals.notifications || 0),
      safetyAppeals: Number(totals.safety_appeals || 0),
    } : null,
  };
}

export async function relationalActiveOperationCount({ pool, userId }) {
  const result = await pool.query(
    `select count(*)::int as count
     from public.wigolink_transactions tx
     where ${transactionParticipantFilter('$1')}
       and coalesce(tx.data->>'status', '') not in (
         'delivery_confirmed', 'released', 'refunded', 'cancelled'
       )`,
    [userId],
  );
  return Number(result.rows[0]?.count || 0);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}
