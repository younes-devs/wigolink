import { Router } from 'express';
import { publicTripCatalog, publicTripDetail } from '../services/public-trip-catalog.js';

export function createTripsRouter({
  auth,
  trips,
  notifyPublicTrip = async () => {},
}) {
  const router = Router();

  function sendResult(res, result) {
    return res.status(result.status).json(result.body);
  }

  function notifySearchEngines(tripId) {
    void Promise.resolve(notifyPublicTrip(tripId)).catch(() => {});
  }

  router.get('/public/trips', (req, res) => {
    res.set('Cache-Control', 'public, s-maxage=15, stale-while-revalidate=60');
    res.json(publicTripCatalog(trips.publicList(req.query)));
  });

  router.get('/public/trips/:id', (req, res) => {
    return sendResult(res, publicTripDetail(trips.detail(req.params.id, null)));
  });

  router.get('/trips/mine', auth, (req, res) => {
    res.json(trips.mine(req.user));
  });

  router.post('/trips', auth, async (req, res) => {
    const result = await trips.create(req.user, req.body);
    if (result.status < 300 && result.body?.trip?.id) notifySearchEngines(result.body.trip.id);
    return sendResult(res, result);
  });

  router.patch('/trips/:id', auth, async (req, res) => {
    const result = await trips.update(req.params.id, req.user, req.body);
    if (result.status < 300) notifySearchEngines(req.params.id);
    return sendResult(res, result);
  });

  router.delete('/trips/:id', auth, async (req, res) => {
    const result = await trips.remove(req.params.id, req.user);
    if (result.status < 300) notifySearchEngines(req.params.id);
    return sendResult(res, result);
  });

  router.get('/trips', auth, (req, res) => {
    res.json(trips.list(req.user, req.query));
  });

  router.get('/trips/overview', auth, (req, res) => {
    res.json(trips.overview(req.user, req.query));
  });

  router.get('/trips/:id', auth, (req, res, next) => {
    if (req.params.id === 'mine') return next();
    return sendResult(
      res,
      trips.detail(req.params.id, req.user),
    );
  });

  router.get('/saved-trips', auth, (req, res) => {
    res.json(trips.saved(req.user));
  });

  router.post('/saved-trips/:tripId', auth, (req, res) => {
    return sendResult(
      res,
      trips.saveTrip(req.params.tripId, req.user),
    );
  });

  router.delete('/saved-trips/:tripId', auth, (req, res) => {
    res.json(trips.unsaveTrip(req.params.tripId, req.user));
  });

  return router;
}
