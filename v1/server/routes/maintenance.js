import { Router } from 'express';

export function createMaintenanceRouter({
  auth,
  adminOnly,
  db,
  messageMedia,
  migrateMessageMedia,
  audit,
  save,
}) {
  const router = Router();

  router.get('/admin/maintenance', auth, adminOnly, (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      maintenance: {
        inlineMessageAttachments: countInlineAttachments(db),
        messageStorageConfigured: !!messageMedia?.enabled,
      },
    });
  });

  router.post('/admin/maintenance/message-media', auth, adminOnly, async (req, res) => {
    if (!messageMedia?.enabled) {
      return res.status(503).json({ error: 'Stockage des images indisponible' });
    }
    try {
      const result = await migrateMessageMedia({ state: db, messageMedia });
      await audit(req.user.id, 'maintenance.message_media', 'system', 'message-media', {
        migrated: result.migrated,
        skipped: result.skipped,
      });
      save();
      return res.json({
        ok: true,
        migrated: result.migrated,
        remaining: countInlineAttachments(db),
      });
    } catch (error) {
      console.error(JSON.stringify({
        level: 'error',
        event: 'maintenance.message_media.failed',
        requestId: req.requestId || null,
        message: error?.message || 'unknown_error',
      }));
      return res.status(503).json({
        error: 'Migration des images indisponible',
        requestId: req.requestId || undefined,
      });
    }
  });

  return router;
}

function countInlineAttachments(db) {
  return (db.messages || []).reduce((count, message) => (
    count + (message.attachments || []).filter((attachment) => !!attachment?.dataUrl).length
  ), 0);
}
