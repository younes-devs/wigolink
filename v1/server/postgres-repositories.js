import pg from 'pg';

const { Pool } = pg;

export function createPostgresPool({ connectionString }) {
  return new Pool({ connectionString });
}

export function createPostgresAuditLogRepository({ pool, findUser, publicUser }) {
  return {
    async append({ actorId, action, targetType, targetId, meta = {} }) {
      const result = await pool.query(
        `insert into audit_logs (actor_id, action, target_type, target_id, meta)
         values ($1, $2, $3, $4, $5)
         returning id, actor_id, action, target_type, target_id, meta, at`,
        [actorId, action, targetType, targetId, JSON.stringify(meta || {})]
      );
      return fromAuditRow(result.rows[0], { findUser, publicUser });
    },

    async list({ limit = 80 } = {}) {
      const safeLimit = Math.max(1, Math.min(200, Number(limit) || 80));
      const result = await pool.query(
        `select id, actor_id, action, target_type, target_id, meta, at
         from audit_logs
         order by at desc
         limit $1`,
        [safeLimit]
      );
      return result.rows.map((row) => fromAuditRow(row, { findUser, publicUser }));
    },

    flush() {},
  };
}

function fromAuditRow(row, { findUser, publicUser }) {
  if (!row) return null;
  const actorId = row.actor_id;
  return {
    id: String(row.id),
    actorId,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    meta: row.meta || {},
    at: row.at instanceof Date ? row.at.getTime() : new Date(row.at).getTime(),
    actor: publicUser(findUser(actorId)) || { id: actorId, name: 'system' },
  };
}
