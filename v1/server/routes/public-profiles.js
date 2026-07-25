import { Router } from 'express';

export function createPublicProfilesRouter({
  auth,
  publicProfiles,
}) {
  const router = Router();

  function sendResult(res, result) {
    return res.status(result.status).json(result.body);
  }

  router.post('/transactions/:id/rate', auth, (req, res) => {
    return sendResult(
      res,
      publicProfiles.rate(req.params.id, req.user, req.body),
    );
  });

  router.get('/users/:id/reviews', auth, (req, res) => {
    return sendResult(
      res,
      publicProfiles.reviews(req.params.id),
    );
  });

  router.get('/users/:id', auth, (req, res) => {
    return sendResult(
      res,
      publicProfiles.profile(req.params.id),
    );
  });

  return router;
}
