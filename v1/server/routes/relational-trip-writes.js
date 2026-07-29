import { Router } from 'express';

export function createRelationalTripWriteRouter({
  auth,
  enabled,
  mutationsEnabled = () => false,
  writer,
}) {
  const router = Router();

  router.post('/trips', auth, async (req, res, next) => {
    if (!mutationsEnabled()) return next('route');
    const result = await writer.create({
      user: req.user,
      body: req.body,
    });
    return res.status(result.status).json(result.body);
  });

  router.patch('/trips/:tripId', auth, async (req, res, next) => {
    if (!mutationsEnabled()) return next('route');
    const result = await writer.update({
      user: req.user,
      tripId: req.params.tripId,
      body: req.body,
    });
    return res.status(result.status).json(result.body);
  });

  router.delete('/trips/:tripId', auth, async (req, res, next) => {
    if (!mutationsEnabled()) return next('route');
    const result = await writer.remove({
      user: req.user,
      tripId: req.params.tripId,
    });
    return res.status(result.status).json(result.body);
  });

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
