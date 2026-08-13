import { Router } from 'express';

export function createManualPayoutsRouter({ auth, adminOnly, payouts, enabled }) {
  const router = Router();
  const dispatch = (handler) => async (req, res, next) => {
    if (!enabled()) return next('route');
    try {
      const result = await handler(req);
      return res.status(result.status).json(result.body);
    } catch (error) {
      return next(error);
    }
  };

  router.get('/payouts/status', auth, dispatch((req) => payouts.status({ user: req.user })));
  router.put('/payouts/account', auth, dispatch((req) => payouts.saveAccount({
    user: req.user,
    body: req.body,
  })));
  router.get('/admin/payouts/manual', auth, adminOnly, dispatch((req) => payouts.listRequests({
    admin: req.user,
    status: req.query.status,
    country: req.query.country,
    cursor: req.query.cursor,
    limit: req.query.limit,
  })));
  router.post('/admin/payouts/manual/:id/sent', auth, adminOnly, dispatch((req) => payouts.markSent({
    admin: req.user,
    operationId: req.params.id,
    reference: req.body?.reference,
  })));

  return router;
}
