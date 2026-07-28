import { Router } from 'express';

export function createAdminReviewRouter({ auth, adminOnly, adminReview }) {
  const router = Router();

  router.post('/admin/review/:id', auth, adminOnly, async (req, res) => {
    const result = await adminReview.review({
      actorId: req.user.id,
      reviewId: req.params.id,
      decision: req.body.decision,
      maxQty: req.body.maxQty,
    });
    res.status(result.status).json(result.body);
  });

  return router;
}
