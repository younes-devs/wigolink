import { Router } from 'express';

export function createMemberOverviewRouter({
  auth,
  memberOverview,
}) {
  const router = Router();

  router.get('/navigation-summary', auth, (req, res) => {
    res.json(memberOverview.navigation(req.user));
  });

  router.get('/trust-center', auth, async (req, res) => {
    res.json({ trust: await memberOverview.trust(req.user) });
  });

  router.get('/dashboard', auth, async (req, res) => {
    res.json(await memberOverview.dashboard(req.user, req.lang));
  });

  return router;
}
