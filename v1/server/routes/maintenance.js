import { Router } from 'express';

export function createMaintenanceRouter({
  auth,
  adminOnly,
  db,
  messageMedia,
  kycMedia = null,
  profileMedia = null,
  migrateMessageMedia,
  migrateKycMedia = null,
  migrateProfileMedia = null,
  audit,
  save,
}) {
  const router = Router();

  router.get('/admin/maintenance', auth, adminOnly, (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      maintenance: {
        inlineMessageAttachments: countInlineAttachments(db),
        inlineKycPhotos: countInlineKycPhotos(db),
        inlineProfilePhotos: countInlineProfilePhotos(db),
        messageStorageConfigured: !!messageMedia?.enabled,
        kycStorageConfigured: !!kycMedia?.enabled,
        profileStorageConfigured: !!profileMedia?.enabled,
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
      await save();
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

  router.post('/admin/maintenance/kyc-media', auth, adminOnly, async (req, res) => {
    return migrateMedia({
      req,
      res,
      media: kycMedia,
      migrate: migrateKycMedia,
      action: 'maintenance.kyc_media',
      targetId: 'kyc-media',
      remaining: () => countInlineKycPhotos(db),
    });
  });

  router.post('/admin/maintenance/profile-media', auth, adminOnly, async (req, res) => {
    return migrateMedia({
      req,
      res,
      media: profileMedia,
      migrate: migrateProfileMedia,
      action: 'maintenance.profile_media',
      targetId: 'profile-media',
      remaining: () => countInlineProfilePhotos(db),
    });
  });

  async function migrateMedia({
    req,
    res,
    media,
    migrate,
    action,
    targetId,
    remaining,
  }) {
    if (!media?.enabled || !migrate) {
      return res.status(503).json({ error: 'Stockage des images indisponible' });
    }
    try {
      const result = await migrate({ state: db, kycMedia: media, profileMedia: media });
      await audit(req.user.id, action, 'system', targetId, {
        migrated: result.migrated,
        skipped: result.skipped,
      });
      await save();
      return res.json({
        ok: true,
        migrated: result.migrated,
        remaining: remaining(),
      });
    } catch (error) {
      console.error(JSON.stringify({
        level: 'error',
        event: `${action}.failed`,
        requestId: req.requestId || null,
        message: error?.message || 'unknown_error',
      }));
      return res.status(503).json({
        error: 'Migration des images indisponible',
        requestId: req.requestId || undefined,
      });
    }
  }

  return router;
}

function countInlineKycPhotos(db) {
  const fields = ['selfiePhoto', 'idFrontPhoto', 'idBackPhoto'];
  return (db.kycSubmissions || []).reduce((count, submission) => (
    count + fields.filter((field) => (
      typeof submission?.[field] === 'string'
      && submission[field].startsWith('data:image/')
    )).length
  ), 0);
}

function countInlineProfilePhotos(db) {
  return (db.users || []).filter((user) => (
    typeof user?.photoUrl === 'string'
    && user.photoUrl.startsWith('data:image/')
  )).length;
}

function countInlineAttachments(db) {
  return (db.messages || []).reduce((count, message) => (
    count + (message.attachments || []).filter((attachment) => !!attachment?.dataUrl).length
  ), 0);
}
