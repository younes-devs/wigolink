import { Router } from 'express';

export function createGuidanceCentersRouter({
  auth,
  guidanceCenters,
}) {
  const router = Router();

  router.get('/documents-center', auth, (req, res) => {
    res.json({ documents: guidanceCenters.documents(req.user) });
  });

  router.get('/compliance-center', auth, (req, res) => {
    res.json({
      compliance: guidanceCenters.compliance(req.user, req.lang),
    });
  });

  router.get('/support-center', auth, (req, res) => {
    res.json({ support: guidanceCenters.support(req.user) });
  });

  return router;
}
