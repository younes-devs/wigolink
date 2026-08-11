import { Router } from 'express';

export function createParcelPhotosRouter({
  auth,
  getPool,
  db,
  parcelMedia,
  memberMediaUploads,
  logger = console,
}) {
  const router = Router();

  router.post('/trip-requests/parcel-photos/uploads', auth, async (req, res) => {
    try {
      const value = await memberMediaUploads.reserveParcel({
        userId: req.user.id,
        photos: req.body?.photos,
      });
      return res.json(value);
    } catch (error) {
      logger.error('parcel_photo_reservation_failed', {
        userId: req.user?.id,
        message: error?.message || 'unknown_error',
      });
      const invalid = /photo|image|lourde|invalide/i.test(error?.message || '');
      return res.status(invalid ? 400 : 503).json({
        error: invalid
          ? 'Ajoutez entre 1 et 5 photos valides du colis'
          : 'Le stockage des photos du colis est temporairement indisponible',
      });
    }
  });

  router.get('/operations/:operationId/parcel-photos/:photoId', auth, async (req, res) => {
    try {
      const operation = await findOperation({
        pool: getPool(),
        db,
        operationId: req.params.operationId,
      });
      if (!operation || (!req.user.isAdmin && ![
        operation.senderId,
        operation.travelerId,
        operation.recipientId,
      ].includes(req.user.id))) {
        return res.status(404).json({ error: 'Photo introuvable' });
      }
      const photo = (operation.parcelPhotos || []).find((item) => item.id === req.params.photoId);
      if (!photo?.storagePath) return res.status(404).json({ error: 'Photo introuvable' });
      const result = await parcelMedia.download(photo.storagePath);
      if (!result || result.status !== 200) return res.status(404).json({ error: 'Photo introuvable' });
      res.setHeader('Content-Type', result.contentType);
      res.setHeader('Cache-Control', 'private, max-age=300');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      return res.send(result.body);
    } catch {
      return res.status(503).json({ error: 'Photo temporairement indisponible' });
    }
  });

  return router;
}

async function findOperation({ pool, db, operationId }) {
  if (pool?.query) {
    try {
      const result = await pool.query(
        'select data from public.wigolink_transactions where id = $1',
        [String(operationId)],
      );
      if (result.rows[0]?.data) return result.rows[0].data;
    } catch {
      // Le stockage JSON local reste disponible hors production.
    }
  }
  return db?.transactions?.find((item) => item.id === operationId) || null;
}
