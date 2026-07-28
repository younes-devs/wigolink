import { Router } from 'express';

export function createLocationsRouter({
  auth,
  suggest,
  findById,
  stats,
}) {
  const router = Router();

  router.get('/locations/suggest', auth, (req, res) => {
    const countryCode = String(req.query.country || 'MA').toUpperCase();
    const locations = suggest(req.query.q, {
      countryCode,
      limit: req.query.limit,
    });
    return res.json({
      locations,
      query: String(req.query.q || '').trim(),
      countryCode,
    });
  });

  router.get('/locations/:id', auth, (req, res) => {
    const location = findById(req.params.id, req.query.country || 'MA');
    if (!location) return res.status(404).json({ error: 'Ville introuvable' });
    return res.json({ location });
  });

  router.get('/locations', auth, (req, res) => {
    return res.json({ catalog: stats(req.query.country || 'MA') });
  });

  return router;
}
