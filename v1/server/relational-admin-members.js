const DEFAULT_LIMIT = 100;

export function relationalAdminMembersEnabled(env = process.env) {
  return env.RELATIONAL_ADMIN_MEMBERS === 'true';
}

export async function relationalAdminUsers({
  pool,
  q = '',
  limit = DEFAULT_LIMIT,
} = {}) {
  requirePool(pool);
  const needle = String(q || '').trim().toLowerCase();
  const bounded = Math.max(1, Math.min(DEFAULT_LIMIT, Number(limit) || DEFAULT_LIMIT));
  const [members, admins] = await Promise.all([
    pool.query(
      `select data
       from public.wigofly_users
       where (
         $1 = ''
         or lower(
           coalesce(data->>'name', '') || ' '
           || coalesce(data->>'email', '') || ' '
           || coalesce(data->>'city', '')
         ) like '%' || $1 || '%'
       )
       order by
         case when coalesce((data->>'isAdmin')::boolean, false) then 0 else 1 end,
         coalesce((data->>'createdAt')::bigint, 0) desc
       limit $2`,
      [needle, bounded],
    ),
    pool.query(
      `select count(*)::int as count
       from public.wigofly_users
       where coalesce((data->>'isAdmin')::boolean, false)
         and nullif(data->>'deletedAt', '') is null`,
    ),
  ]);
  return {
    users: members.rows.map((row) => row.data),
    adminCount: Number(admins.rows[0]?.count || 0),
  };
}

export async function relationalAdminUsersByIds({ pool, ids = [] } = {}) {
  requirePool(pool);
  const uniqueIds = [...new Set(ids.map(String).filter(Boolean))].slice(0, 500);
  if (!uniqueIds.length) return [];
  const result = await pool.query(
    `select data
     from public.wigofly_users
     where id = any($1::text[])`,
    [uniqueIds],
  );
  return result.rows.map((row) => row.data);
}

function requirePool(pool) {
  if (!pool || typeof pool.query !== 'function') {
    throw new Error('Un pool Postgres est requis.');
  }
}
