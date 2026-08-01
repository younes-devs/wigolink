import pg from 'pg';
import {
  notificationCutoff,
  NOTIFICATION_RETENTION_MS,
} from './notification-retention.js';

const { Pool } = pg;

export function securePostgresConfig({ connectionString }) {
  if (!connectionString) throw new Error('DATABASE_URL est requis.');
  const url = new URL(connectionString);

  // Always encrypt the connection. Supabase's transaction pooler does not expose
  // a certificate chain that every Vercel runtime can validate reliably.
  url.searchParams.delete('sslmode');
  url.searchParams.delete('sslcert');
  url.searchParams.delete('sslkey');
  url.searchParams.delete('sslrootcert');

  return {
    connectionString: url.toString(),
    ssl: { rejectUnauthorized: false },
  };
}

export function createPostgresPool({ connectionString, ...options }) {
  return new Pool({ ...options, ...securePostgresConfig({ connectionString }) });
}

export function databasePoolOptions(env = process.env) {
  const parsed = Number.parseInt(env.DB_POOL_MAX, 10);
  const serverless = env.VERCEL === '1' || !!env.VERCEL_ENV;
  const parsedQueryTimeout = Number.parseInt(env.DB_QUERY_TIMEOUT_MS, 10);
  return {
    max: Number.isFinite(parsed)
      ? Math.max(1, Math.min(20, parsed))
      : serverless ? 2 : 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
    query_timeout: Number.isFinite(parsedQueryTimeout)
      ? Math.max(1_000, Math.min(30_000, parsedQueryTimeout))
      : 10_000,
    maxUses: 5_000,
    allowExitOnIdle: true,
  };
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

    async listForMember(userId, { limit = 200 } = {}) {
      const safeLimit = Math.max(1, Math.min(500, Number(limit) || 200));
      const result = await pool.query(
        `select id, actor_id, action, target_type, target_id, meta, at
         from audit_logs
         where actor_id = $1 or target_id = $1 or meta->>'subjectUserId' = $1
         order by at desc
         limit $2`,
        [userId, safeLimit]
      );
      return result.rows.map((row) => fromAuditRow(row, { findUser, publicUser }));
    },

    flush() {},
  };
}

export function createPostgresNotificationRepository({
  pool,
  now = Date.now,
  retentionMs = NOTIFICATION_RETENTION_MS,
}) {
  const cutoff = () => notificationCutoff({ now, retentionMs });

  return {
    async append({ userId, txId = null, type = 'transactions', section = null, key = null, params = {}, text = null, at = Date.now() }) {
      const result = await pool.query(
        `insert into notifications (id, user_id, tx_id, type, section, key, params, text, read, at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, false, to_timestamp($9 / 1000.0))
         returning id, user_id, tx_id, type, section, key, params, text, read, at`,
        [notificationId(), userId, txId, type, section, key, JSON.stringify(params || {}), text, at]
      );
      return fromNotificationRow(result.rows[0]);
    },

    async listForUser(userId, { limit = 30 } = {}) {
      const safeLimit = Math.max(1, Math.min(100, Number(limit) || 30));
      const result = await pool.query(
        `select id, user_id, tx_id, type, section, key, params, text, read, at
         from notifications
         where user_id = $1
           and at >= to_timestamp($2 / 1000.0)
           and key is distinct from 'chat.message'
         order by at desc
         limit $3`,
        [userId, cutoff(), safeLimit]
      );
      return result.rows.map(fromNotificationRow);
    },

    async unreadCount(userId) {
      const result = await pool.query(
        `select count(*)::int as count
         from notifications
         where user_id = $1
           and read = false
           and at >= to_timestamp($2 / 1000.0)
           and key is distinct from 'chat.message'`,
        [userId, cutoff()]
      );
      return Number(result.rows[0]?.count || 0);
    },

    async markAllRead(userId) {
      const result = await pool.query(
        `update notifications
         set read = true
         where user_id = $1
           and read = false
           and at >= to_timestamp($2 / 1000.0)`,
        [userId, cutoff()]
      );
      return result.rowCount || 0;
    },
  };
}

export function createPostgresMessageRepository({ pool }) {
  return {
    async append({ txId, from, text, flagged = false, at = Date.now() }) {
      const result = await pool.query(
        `insert into messages (id, tx_id, from_id, text, flagged, at)
         values ($1, $2, $3, $4, $5, to_timestamp($6 / 1000.0))
         returning id, tx_id, from_id, text, flagged, at`,
        [messageId(), txId, from, text, !!flagged, at]
      );
      return fromMessageRow(result.rows[0]);
    },

    async listForTransaction(txId) {
      const result = await pool.query(
        `select id, tx_id, from_id, text, flagged, at
         from messages
         where tx_id = $1
         order by at asc`,
        [txId]
      );
      return result.rows.map(fromMessageRow);
    },

    async listFromUser(userId) {
      const result = await pool.query(
        `select id, tx_id, from_id, text, flagged, at
         from messages
         where from_id = $1
         order by at desc`,
        [userId]
      );
      return result.rows.map(fromMessageRow);
    },

    async flaggedFromUser(userId) {
      const result = await pool.query(
        `select id, tx_id, from_id, text, flagged, at
         from messages
         where from_id = $1 and flagged = true
         order by at desc`,
        [userId]
      );
      return result.rows.map(fromMessageRow);
    },

    async flagged() {
      const result = await pool.query(
        `select id, tx_id, from_id, text, flagged, at
         from messages
         where flagged = true
         order by at desc`
      );
      return result.rows.map(fromMessageRow);
    },

    async flaggedSenderCount() {
      const result = await pool.query(
        `select count(distinct from_id)::int as count
         from messages
         where flagged = true`
      );
      return Number(result.rows[0]?.count || 0);
    },

    async count() {
      const result = await pool.query(`select count(*)::int as count from messages`);
      return Number(result.rows[0]?.count || 0);
    },

    async all() {
      const result = await pool.query(
        `select id, tx_id, from_id, text, flagged, at
         from messages
         order by at desc`
      );
      return result.rows.map(fromMessageRow);
    },
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

function fromMessageRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    txId: row.tx_id,
    from: row.from_id,
    text: row.text,
    flagged: !!row.flagged,
    at: row.at instanceof Date ? row.at.getTime() : new Date(row.at).getTime(),
  };
}

function fromNotificationRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    txId: row.tx_id,
    type: row.type,
    section: row.section,
    key: row.key,
    params: row.params || {},
    text: row.text,
    read: !!row.read,
    at: row.at instanceof Date ? row.at.getTime() : new Date(row.at).getTime(),
  };
}

function notificationId() {
  return `n-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function messageId() {
  return `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
