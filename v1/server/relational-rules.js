const DEFAULT_LIMIT = 500;

export async function relationalCustomWhitelist({
  pool,
  limit = DEFAULT_LIMIT,
} = {}) {
  requirePool(pool);
  const bounded = Math.max(
    1,
    Math.min(DEFAULT_LIMIT, Number(limit) || DEFAULT_LIMIT),
  );
  const result = await pool.query(
    `select data
     from public.wigolink_custom_whitelist
     order by created_at asc, id asc
     limit $1`,
    [bounded],
  );
  return result.rows.map((row) => row.data);
}

function requirePool(pool) {
  if (!pool || typeof pool.query !== 'function') {
    throw new Error('Un pool Postgres est requis.');
  }
}
