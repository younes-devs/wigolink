const DEFAULT_LIMIT = 200;
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

    const reservations = await pool.query(
      `select kind, id, data
       from public.wigofly_runtime_records
       where kind in ('message_upload', 'member_media_upload')
         and expires_at <= now()
       order by expires_at
       limit $1`,
      [boundedLimit(limit)],
    );
    const removedReservationIds = [];
    let mediaFailures = 0;
    for (const row of reservations.rows) {
      const path = String(row.data?.storagePath || '');
      try {
        if (row.kind === 'message_upload' && path && messageMedia?.enabled) {
          await messageMedia.remove(path);
        }
        if (row.kind === 'member_media_upload') {
          await memberMediaUploads?.cleanupData(row.data);
        }
        removedReservationIds.push(row.id);
      } catch (error) {
        mediaFailures += 1;
        logger.error('retention_upload_remove_failed', {
          kind: row.kind,
          id: row.id,
          message: error?.message || 'unknown_error',
        });
      }
    }

    if (removedReservationIds.length) {
      await pool.query(
        `delete from public.wigofly_runtime_records
         where kind in ('message_upload', 'member_media_upload')
           and id = any($1::text[])`,
        [removedReservationIds],
      );
    }

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
      expiredUploads: removedReservationIds.length,
      uploadFailures: mediaFailures,
      expiredSessions: sessions.rowCount || 0,
      expiredRuntimeRecords: runtime.rowCount || 0,
      expiredNotifications: notifications.rowCount || 0,
      hasMoreUploads: reservations.rowCount >= boundedLimit(limit),
    };
  }

  return { run };
}

function boundedLimit(value) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number)
    ? Math.max(1, Math.min(500, number))
    : DEFAULT_LIMIT;
}
