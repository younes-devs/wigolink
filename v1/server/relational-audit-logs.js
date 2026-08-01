import { decodePageCursor, encodePageCursor } from './pagination-cursor.js';

const DEFAULT_LIMIT = 80;
const MAX_LIMIT = 200;

export async function relationalAuditLogs({
  pool,
  limit = DEFAULT_LIMIT,
  cursor = null,
} = {}) {
  requirePool(pool);
  const bounded = Math.max(
    1,
    Math.min(MAX_LIMIT, Number(limit) || DEFAULT_LIMIT),
  );
  const pageCursor = decodeAuditCursor(cursor);
  const params = [];
  let cursorClause = '';
  if (pageCursor) {
    params.push(new Date(pageCursor.at), pageCursor.id);
    cursorClause = 'where (log.at, log.id) < ($1, $2::bigint)';
  }
  params.push(bounded + 1);
  const result = await pool.query(
    `select
       log.id,
       log.actor_id,
       log.action,
       log.target_type,
       log.target_id,
       log.meta,
       log.at,
       member.data as actor
     from public.audit_logs log
     left join public.wigolink_users member on member.id = log.actor_id
     ${cursorClause}
     order by log.at desc, log.id desc
     limit $${params.length}`,
    params,
  );
  const hasMore = result.rows.length > bounded;
  const selected = result.rows.slice(0, bounded);
  const last = selected.at(-1);
  return {
    logs: selected.map(fromRow),
    page: {
      limit: bounded,
      hasMore,
      nextCursor: hasMore && last ? encodePageCursor({
        at: last.at instanceof Date ? last.at.getTime() : new Date(last.at).getTime(),
        id: String(last.id),
      }) : null,
    },
  };
}

function fromRow(row) {
  const actorId = row.actor_id;
  return {
    id: String(row.id),
    actorId,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    meta: row.meta || {},
    at: row.at instanceof Date ? row.at.getTime() : new Date(row.at).getTime(),
    actor: publicActor(row.actor, actorId),
  };
}

function publicActor(actor, actorId) {
  if (!actor) return { id: actorId, name: 'system' };
  return {
    id: actor.id,
    name: actor.name,
    city: actor.city,
    kycStatus: actor.kycStatus,
    rating: actor.rating,
    ratingCount: actor.ratingCount,
    completed: actor.completed,
    cancelRate: actor.cancelRate,
    badges: actor.badges,
    photoUrl: actor.photoUrl || null,
    isAdmin: !!actor.isAdmin,
    createdAt: actor.createdAt,
    onboardingDone: !!actor.settings?.onboardingDone,
    emailVerified: !!actor.emailVerified,
  };
}

function requirePool(pool) {
  if (!pool || typeof pool.query !== 'function') {
    throw new Error('Un pool Postgres est requis.');
  }
}

function decodeAuditCursor(value) {
  return decodePageCursor(value, (cursor) => (
    cursor
    && Number.isFinite(Number(cursor.at))
    && Number(cursor.at) > 0
    && /^\d+$/.test(String(cursor.id || ''))
  ));
}
