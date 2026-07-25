import { Router } from 'express';

export function createRealtimeRouter({
  auth,
  realtime,
}) {
  const router = Router();

  router.get('/', auth, (_req, res) => {
    res.status(410).json({
      error: 'Le temps reel SSE est remplace par la synchronisation automatique.',
    });
  });

  router.post('/session', auth, (req, res) => {
    const config = realtime.publicConfig();
    if (!config) return res.json({ enabled: false });

    return res.json({
      enabled: true,
      url: config.url,
      publishableKey: config.publishableKey,
      channel: realtime.ensureChannel(req.user),
    });
  });

  return router;
}
