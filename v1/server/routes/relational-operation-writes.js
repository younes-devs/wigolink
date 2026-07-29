import { Router } from 'express';

export function createRelationalOperationWriteRouter({
  auth,
  enabled,
  writer,
}) {
  const router = Router();

  router.post('/trips/:id/accept', auth, dispatch(enabled, (req) => (
    writer.accept({
      user: req.user,
      tripId: req.params.id,
      body: req.body,
    })
  )));

  const actions = {
    pay: 'pay',
    'pickup-code': 'issuePickupCode',
    'delivery-code': 'issueDeliveryCode',
    'confirm-pickup': 'confirmPickup',
    'confirm-delivery': 'confirmDelivery',
    confirm: 'confirm',
    reject: 'reject',
    cancel: 'cancel',
    dispute: 'openDispute',
    evidence: 'addEvidence',
  };
  for (const [route, method] of Object.entries(actions)) {
    router.post(`/operations/:id/${route}`, auth, dispatch(enabled, (req) => (
      writer[method]({
        user: req.user,
        operationId: req.params.id,
        body: req.body,
      })
    )));
  }
  return router;
}

function dispatch(enabled, handler) {
  return async (req, res, next) => {
    if (!enabled()) return next('route');
    const result = await handler(req);
    return res.status(result.status).json(result.body);
  };
}
