import { Router } from 'express';

export function createLocationsRouter({
  auth,
  suggest,
  findById,
  stats,
}) {
  const router = Router();

  // City names and aliases are public catalogue data used by the guest trip search.
  router.get('/locations/suggest', (req, res) => {
    res.set('Cache-Control', 'public, max-age=300, s-maxage=86400');
    const countryCode = String(req.query.country || 'ALL').toUpperCase();
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
    const location = findById(req.params.id, req.query.country || 'ALL');
    if (!location) return res.status(404).json({ error: 'Ville introuvable' });
    return res.json({ location });
  });

  router.get('/locations', auth, (req, res) => {
    return res.json({ catalog: stats(req.query.country || 'ALL') });
  });

  return router;
}
