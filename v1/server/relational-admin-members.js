import { decodePageCursor, encodePageCursor } from './pagination-cursor.js';

const DEFAULT_LIMIT = 100;

export function relationalAdminMembersEnabled(env = process.env) {
  return env.RELATIONAL_ADMIN_MEMBERS === 'true';
}

export async function relationalAdminUsers({
  pool,
  q = '',
  limit = DEFAULT_LIMIT,
  cursor = null,
} = {}) {
  requirePool(pool);
  const needle = String(q || '').trim().toLowerCase();
  const bounded = Math.max(1, Math.min(DEFAULT_LIMIT, Number(limit) || DEFAULT_LIMIT));
  const pageCursor = decodeAdminMemberCursor(cursor);
  const params = [needle];
  let cursorClause = '';
  if (pageCursor) {
    params.push(pageCursor.adminRank, pageCursor.createdAt, pageCursor.id);
    cursorClause = `and (
      case when coalesce((data->>'isAdmin')::boolean, false) then 0 else 1 end > $2
      or (
        case when coalesce((data->>'isAdmin')::boolean, false) then 0 else 1 end = $2
        and coalesce((data->>'createdAt')::bigint, 0) < $3
      )
      or (
        case when coalesce((data->>'isAdmin')::boolean, false) then 0 else 1 end = $2
        and coalesce((data->>'createdAt')::bigint, 0) = $3
        and id > $4
      )
    )`;
  }
  params.push(bounded + 1);
  const [members, admins] = await Promise.all([
    pool.query(
      `select id, data,
         case when coalesce((data->>'isAdmin')::boolean, false) then 0 else 1 end as admin_rank,
         coalesce((data->>'createdAt')::bigint, 0) as sort_created_at
       from public.wigolink_users
       where (
         $1 = ''
         or lower(
           coalesce(data->>'name', '') || ' '
           || coalesce(data->>'email', '') || ' '
           || coalesce(data->>'city', '')
         ) like '%' || $1 || '%'
       )
       ${cursorClause}
       order by
         case when coalesce((data->>'isAdmin')::boolean, false) then 0 else 1 end,
         coalesce((data->>'createdAt')::bigint, 0) desc,
         id asc
       limit $${params.length}`,
      params,
    ),
    pool.query(
      `select count(*)::int as count
       from public.wigolink_users
       where coalesce((data->>'isAdmin')::boolean, false)
         and nullif(data->>'deletedAt', '') is null`,
    ),
  ]);
  const hasMore = members.rows.length > bounded;
  const selected = members.rows.slice(0, bounded);
  const last = selected.at(-1);
  return {
    users: selected.map((row) => row.data),
    adminCount: Number(admins.rows[0]?.count || 0),
    page: {
      limit: bounded,
      hasMore,
      nextCursor: hasMore && last ? encodePageCursor({
        adminRank: Number(last.admin_rank),
        createdAt: Number(last.sort_created_at),
        id: String(last.id),
      }) : null,
    },
  };
}

export async function relationalAdminUsersByIds({ pool, ids = [] } = {}) {
  requirePool(pool);
  const uniqueIds = [...new Set(ids.map(String).filter(Boolean))].slice(0, 500);
  if (!uniqueIds.length) return [];
  const result = await pool.query(
    `select data
     from public.wigolink_users
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

function decodeAdminMemberCursor(value) {
  return decodePageCursor(value, (cursor) => (
    cursor
    && [0, 1].includes(Number(cursor.adminRank))
    && Number.isFinite(Number(cursor.createdAt))
    && typeof cursor.id === 'string'
    && cursor.id.length > 0
    && cursor.id.length <= 120
  ));
}
