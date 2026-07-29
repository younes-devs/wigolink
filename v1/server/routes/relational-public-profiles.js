import { Router } from 'express';

export function createRelationalPublicProfilesRouter({
  auth,
  readsEnabled,
  writesEnabled,
  getPool,
  profile,
  reviews,
  rate,
  normalizeTransportMode,
  detectLeak,
}) {
  const router = Router();

  router.get('/users/:id', auth, async (req, res, next) => {
    if (!readsEnabled()) return next('route');
    const result = await profile({
      pool: getPool(),
      userId: req.params.id,
      normalizeTransportMode,
    });
    return res.status(result.status).json(result.body);
  });

  router.get('/users/:id/reviews', auth, async (req, res, next) => {
    if (!readsEnabled()) return next('route');
    const result = await reviews({
      pool: getPool(),
      userId: req.params.id,
      limit: req.query.limit,
    });
    return res.status(result.status).json(result.body);
  });

  router.post('/transactions/:id/rate', auth, async (req, res, next) => {
    if (!writesEnabled()) return next('route');
    const result = await rate({
      pool: getPool(),
      transactionId: req.params.id,
      user: req.user,
      body: req.body,
      detectLeak,
    });
    return res.status(result.status).json(result.body);
  });

  return router;
}
