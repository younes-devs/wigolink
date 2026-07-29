const DEFAULT_LIMIT = 80;
const MAX_LIMIT = 200;

export async function relationalAuditLogs({
  pool,
  limit = DEFAULT_LIMIT,
} = {}) {
  requirePool(pool);
  const bounded = Math.max(
    1,
    Math.min(MAX_LIMIT, Number(limit) || DEFAULT_LIMIT),
  );
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
     left join public.wigofly_users member on member.id = log.actor_id
     order by log.at desc
     limit $1`,
    [bounded],
  );
  return result.rows.map(fromRow);
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
