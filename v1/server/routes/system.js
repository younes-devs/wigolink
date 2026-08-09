import { Router } from 'express';

export function createSystemRouter({
  demo,
  isProduction,
  emailReady,
  storageReady = false,
  paymentsEnabled = false,
  paymentsReady = false,
  googleClientId = '',
  databaseHealth,
  now = () => new Date(),
}) {
  const router = Router();

  router.get('/config', (_req, res) => {
    res.json({ demo, googleClientId: googleClientId || null });
  });

  router.get('/health', (_req, res) => {
    const database = databaseHealth();
    const ready = (!isProduction || (emailReady && storageReady))
      && (!paymentsEnabled || paymentsReady)
      && database !== 'unavailable';
    res.status(ready ? 200 : 503).json({
      ok: ready,
      database,
      email: emailReady ? 'configured' : 'missing',
      storage: storageReady ? 'configured' : 'missing',
      payments: paymentsEnabled ? (paymentsReady ? 'configured' : 'missing') : 'disabled',
      at: now().toISOString(),
    });
  });

  return router;
}
