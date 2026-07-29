import { Router } from 'express';

export function createRelationalNavigationRouter({
  auth,
  enabled,
  getPool,
  summary,
  logger = console,
}) {
  const router = Router();
  router.get('/navigation-summary', auth, async (req, res, next) => {
    if (!enabled()) return next('route');
    try {
      return res.json(await summary({
        pool: getPool(),
        user: req.user,
      }));
    } catch (error) {
      logger.error('relational_navigation_read_failed', {
        message: error?.message || 'unknown_error',
      });
      return res.status(503).json({
        error: 'Compteurs temporairement indisponibles.',
      });
    }
  });
  return router;
}
