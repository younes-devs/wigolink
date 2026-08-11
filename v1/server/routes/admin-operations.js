import { Router } from 'express';

export function createAdminOperationsRouter({
  auth,
  adminOnly,
  adminOperations,
}) {
  const router = Router();

  router.get('/admin/ops', auth, adminOnly, async (req, res) => {
    const section = req.query.section === 'payments' ? 'payments' : 'overview';
    res.json({ ops: await adminOperations.summary(section) });
  });

  router.get('/admin/overview', auth, adminOnly, async (_req, res) => {
    res.json(await adminOperations.overview());
  });

  router.get('/admin/kpis', auth, adminOnly, async (req, res) => {
    res.json(await adminOperations.kpis(req.lang));
  });

  return router;
}
