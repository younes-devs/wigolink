import { Router } from 'express';

export function createRelationalTripWriteRouter({
  auth,
  enabled,
  writer,
}) {
  const router = Router();

  router.post('/saved-trips/:tripId', auth, async (req, res, next) => {
    if (!enabled()) return next('route');
    const result = await writer.saveTrip({
      user: req.user,
      tripId: req.params.tripId,
    });
    return res.status(result.status).json(result.body);
  });

  router.delete('/saved-trips/:tripId', auth, async (req, res, next) => {
    if (!enabled()) return next('route');
    const result = await writer.unsaveTrip({
      user: req.user,
      tripId: req.params.tripId,
    });
    return res.status(result.status).json(result.body);
  });

  return router;
}
