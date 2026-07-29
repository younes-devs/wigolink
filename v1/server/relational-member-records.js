import { transactionParticipantFilter } from './relational-sql.js';

export async function relationalMemberRecords({ pool, userId }) {
  const result = await pool.query(
    `select
       coalesce((
         select jsonb_agg(t.data order by t.created_at desc)
         from public.wigofly_trips t
         where t.data->>'travelerId' = $1
       ), '[]'::jsonb) as trips,
       coalesce((
         select jsonb_agg(l.data order by l.created_at desc)
         from public.wigofly_listings l
         where l.data->>'senderId' = $1
       ), '[]'::jsonb) as listings,
       coalesce((
         select jsonb_agg(tx.data order by tx.created_at desc)
         from public.wigofly_transactions tx
         where ${transactionParticipantFilter('$1')}
       ), '[]'::jsonb) as transactions,
       coalesce((
         select jsonb_agg(d.data order by d.created_at desc)
         from public.wigofly_disputes d
         where d.data->>'openedBy' = $1
            or exists (
              select 1
              from public.wigofly_transactions tx
              where tx.id = d.data->>'txId'
                and ${transactionParticipantFilter('$1')}
            )
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
           limit 100
         ) n
       ), '[]'::jsonb) as notifications,
       coalesce((
         select jsonb_agg(queue.data order by queue.created_at desc)
         from public.wigofly_review_queue queue
         where queue.data->>'type' = 'safety_appeal'
           and queue.data->>'userId' = $1
       ), '[]'::jsonb) as safety_appeals`,
    [userId],
  );
  const row = result.rows[0] || {};
  return {
    trips: asArray(row.trips),
    listings: asArray(row.listings),
    transactions: asArray(row.transactions),
    disputes: asArray(row.disputes),
    notifications: asArray(row.notifications),
    safetyAppeals: asArray(row.safety_appeals),
  };
}

export async function relationalActiveOperationCount({ pool, userId }) {
  const result = await pool.query(
    `select count(*)::int as count
     from public.wigofly_transactions tx
     where ${transactionParticipantFilter('$1')}
       and coalesce(tx.data->>'status', '') not in (
         'released', 'refunded', 'cancelled'
       )`,
    [userId],
  );
  return Number(result.rows[0]?.count || 0);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}
