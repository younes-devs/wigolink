export async function relationalAdminOperationState({ pool }) {
  const statsResult = await pool.query(
    `select
       count(*)::int as transactions,
       count(*) filter (where data->>'status' = 'released')::int as released,
       count(*) filter (where data->>'status' = 'disputed')::int as disputed,
       coalesce(sum(
         case
           when data->'escrow'->>'state' in ('held', 'frozen')
           then coalesce((data->'escrow'->>'amount')::numeric, 0)
           else 0
         end
       ), 0)::float8 as escrow_held
     from public.wigofly_transactions`,
  );
  const disputesResult = await pool.query(
    `select data
     from public.wigofly_disputes
     order by created_at desc
     limit 500`,
  );
  const reviewResult = await pool.query(
    `select data
     from public.wigofly_review_queue
     where data->>'type' = 'dispute'
       and coalesce(data->>'status', 'open') = 'open'
     order by created_at desc
     limit 200`,
  );
  const stats = statsResult.rows[0] || {};
  return {
    stats: {
      transactions: Number(stats.transactions || 0),
      released: Number(stats.released || 0),
      disputed: Number(stats.disputed || 0),
      escrowHeld: Number(stats.escrow_held || 0),
    },
    disputes: disputesResult.rows.map((row) => row.data),
    reviewQueue: reviewResult.rows.map((row) => row.data),
  };
}
