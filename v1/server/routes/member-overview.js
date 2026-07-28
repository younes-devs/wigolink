import { Router } from 'express';

export function createMemberOverviewRouter({
  auth,
  memberOverview,
}) {
  const router = Router();

  router.get('/navigation-summary', auth, (req, res) => {
    res.json(memberOverview.navigation(req.user));
  });

  return router;
}
