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

  router.get('/stripe/connect/status', auth, dispatch((req) => (
    payments.connectedStatus({ user: req.user, refresh: req.query.refresh === '1' })
  )));

  router.get('/payouts/status', auth, dispatch((req) => (
    payments.connectedStatus({ user: req.user, refresh: req.query.refresh === '1' })
  )));

  router.post('/stripe/connect/account', auth, dispatch((req) => (
    payments.createConnectedAccount({ user: req.user, country: req.body?.country })
  )));

  router.post('/stripe/connect/onboarding-link', auth, dispatch((req) => (
    payments.createOnboardingLink({
      user: req.user,
      country: req.body?.country,
      returnPath: req.body?.returnPath,
      lang: req.lang,
    })
  )));

  router.post('/stripe/connect/account-session', auth, dispatch((req) => (
    payments.createEmbeddedOnboardingSession({
      user: req.user,
      country: req.body?.country,
    })
  )));

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
