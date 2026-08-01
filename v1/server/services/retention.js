const DEFAULT_LIMIT = 500;
const MAX_UPLOAD_ROUNDS = 4;
const NOTIFICATION_RETENTION_DAYS = 10;

export function createRetentionService({
  getPool,
  messageMedia,
  memberMediaUploads = null,
  limit = DEFAULT_LIMIT,
  logger = console,
}) {
  async function run() {
    const pool = getPool();
    if (!pool || typeof pool.query !== 'function') {
      throw new Error('Base de donnees indisponible');
    }

    const uploads = await purgeExpiredUploads({
      pool,
      messageMedia,
      memberMediaUploads,
      limit: boundedLimit(limit),
      logger,
    });

    const [sessions, runtime, notifications] = await Promise.all([
      pool.query(
        `delete from public.wigofly_sessions
         where expires_at <= now()`,
      ),
      pool.query(
        `delete from public.wigofly_runtime_records
         where kind not in ('message_upload', 'member_media_upload')
           and expires_at is not null
           and expires_at <= now()`,
      ),
      pool.query(
        `delete from public.notifications
         where at < now() - interval '${NOTIFICATION_RETENTION_DAYS} days'`,
      ),
    ]);

    return {
      expiredUploads: uploads.removed,
      uploadFailures: uploads.failures,
      expiredSessions: sessions.rowCount || 0,
      expiredRuntimeRecords: runtime.rowCount || 0,
      expiredNotifications: notifications.rowCount || 0,
      hasMoreUploads: uploads.hasMore,
    };
  }

  return { run };
}

async function purgeExpiredUploads({
  pool,
  messageMedia,
  memberMediaUploads,
  limit,
  logger,
}) {
  let removed = 0;
  let failures = 0;
  let hasMore = false;
  for (let round = 0; round < MAX_UPLOAD_ROUNDS; round += 1) {
    const reservations = await pool.query(
      `select kind, id, data
       from public.wigofly_runtime_records
       where kind in ('message_upload', 'member_media_upload')
         and expires_at <= now()
       order by expires_at
       limit $1`,
      [limit],
    );
    if (!reservations.rows.length) {
      hasMore = false;
      break;
    }
    const successfulIds = [];
    const groups = [
      {
        kind: 'message_upload',
        rows: reservations.rows.filter((row) => row.kind === 'message_upload'),
        cleanup: (rows) => messageMedia?.removePaths(
          rows.map((row) => row.data?.storagePath).filter(Boolean),
        ),
      },
      {
        kind: 'member_media_upload',
        rows: reservations.rows.filter((row) => row.kind === 'member_media_upload'),
        cleanup: (rows) => memberMediaUploads?.cleanupMany(rows.map((row) => row.data)),
      },
    ];
    for (const group of groups) {
      if (!group.rows.length) continue;
      try {
        await group.cleanup(group.rows);
        successfulIds.push(...group.rows.map((row) => row.id));
      } catch (error) {
        failures += group.rows.length;
        logger.error('retention_upload_remove_failed', {
          kind: group.kind,
          count: group.rows.length,
          message: error?.message || 'unknown_error',
        });
      }
    }
    if (successfulIds.length) {
      await pool.query(
        `delete from public.wigofly_runtime_records
         where kind in ('message_upload', 'member_media_upload')
           and id = any($1::text[])`,
        [successfulIds],
      );
      removed += successfulIds.length;
    }
    hasMore = reservations.rowCount >= limit;
    if (!hasMore || failures > 0) break;
  }
  return { removed, failures, hasMore };
}

function boundedLimit(value) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number)
    ? Math.max(1, Math.min(500, number))
    : DEFAULT_LIMIT;
}
