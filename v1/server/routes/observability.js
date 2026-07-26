import { Router } from 'express';

export function createObservabilityRouter({ auth, adminOnly, snapshot }) {
  const router = Router();

  router.get('/admin/observability', auth, adminOnly, (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ observability: snapshot() });
  });

  return router;
}
