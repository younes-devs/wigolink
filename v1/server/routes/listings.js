import { Router } from 'express';

export function createListingsRouter({
  auth,
  listings,
}) {
  const router = Router();

  function sendResult(res, result) {
    return res.status(result.status).json(result.body);
  }

  router.get('/listings/mine', auth, (req, res) => {
    res.json(listings.mine(req.user, req.lang));
  });

  router.get('/listings', auth, (req, res) => {
    res.json(listings.list(req.user, req.query, req.lang));
  });

  router.post('/listings/preflight', auth, (req, res) => {
    res.json({
      preflight: listings.preflight(req.user, req.body, req.lang),
    });
  });

  router.post('/listings', auth, async (req, res) => {
    return sendResult(
      res,
      await listings.create(req.user, req.body, req.lang),
    );
  });

  router.put('/listings/:id', auth, async (req, res) => {
    return sendResult(
      res,
      await listings.update(
        req.params.id,
        req.user,
        req.body,
        req.lang,
      ),
    );
  });

  router.post('/listings/:id/cancel', auth, async (req, res) => {
    return sendResult(
      res,
      await listings.cancel(req.params.id, req.user, req.lang),
    );
  });

  return router;
}
