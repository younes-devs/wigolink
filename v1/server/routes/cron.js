import crypto from 'node:crypto';
import { Router } from 'express';

export function createCronRouter({
  secret,
  retention,
  logger = console,
}) {
  const router = Router();

  router.get('/cron/maintenance', async (req, res) => {
    if (!validBearer(req.headers.authorization, secret)) {
      return res.status(401).json({ error: 'Non autorise' });
    }
    try {
      const result = await retention.run();
      res.setHeader('Cache-Control', 'no-store');
      return res.json({ ok: true, retention: result });
    } catch (error) {
      logger.error('cron_maintenance_failed', {
        requestId: req.requestId || null,
        message: error?.message || 'unknown_error',
      });
      return res.status(503).json({
        error: 'Maintenance temporairement indisponible',
        requestId: req.requestId || undefined,
      });
    }
  });

  return router;
}

function validBearer(header, secret) {
  const expected = `Bearer ${String(secret || '')}`;
  const candidate = String(header || '');
  if (!secret || candidate.length !== expected.length) return false;
  return crypto.timingSafeEqual(
    Buffer.from(candidate),
    Buffer.from(expected),
  );
}
