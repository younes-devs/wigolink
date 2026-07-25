import { Router } from 'express';

export function createMatchingOffersRouter({
  auth,
  matchingOffers,
}) {
  const router = Router();

  function sendResult(res, result) {
    return res.status(result.status).json(result.body);
  }

  router.get('/sender-matching', auth, async (req, res) => {
    res.json(await matchingOffers.center(req.user));
  });

  router.get('/matching-offers', auth, async (req, res) => {
    res.json(await matchingOffers.list(req.user));
  });

  router.post('/matching-offers', auth, async (req, res) => {
    return sendResult(
      res,
      await matchingOffers.create(req.user, req.body),
    );
  });

  router.post('/matching-offers/:id/decline', auth, async (req, res) => {
    return sendResult(
      res,
      await matchingOffers.decline(req.params.id, req.user),
    );
  });

  router.post('/matching-offers/:id/withdraw', auth, async (req, res) => {
    return sendResult(
      res,
      await matchingOffers.withdraw(req.params.id, req.user),
    );
  });

  router.post('/matching-offers/:id/counter', auth, async (req, res) => {
    return sendResult(
      res,
      await matchingOffers.counter(
        req.params.id,
        req.user,
        req.body,
      ),
    );
  });

  return router;
}
