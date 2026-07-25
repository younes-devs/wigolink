import { Router } from 'express';

export function createAdminFraudRouter({
  auth,
  adminOnly,
  adminFraud,
}) {
  const router = Router();

  router.get('/admin/fraud', auth, adminOnly, async (_req, res) => {
    res.json(await adminFraud.details());
  });

  return router;
}
