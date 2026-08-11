import { Router } from 'express';

export function createStripePaymentsRouter({
  auth,
  adminOnly,
  payments,
  enabled,
}) {
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

  router.post('/operations/:id/pay', auth, dispatch((req) => (
    payments.createCheckout({
      user: req.user,
      operationId: req.params.id,
      lang: req.lang,
    })
  )));

  router.post('/admin/operations/:id/refund', auth, adminOnly, dispatch((req) => (
    payments.refundOperation({
      admin: req.user,
      operationId: req.params.id,
      reason: req.body?.reason,
    })
  )));

  return router;
}
