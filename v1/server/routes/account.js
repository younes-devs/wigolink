import { Router } from 'express';

export function createAccountRouter({
  auth,
  publicUser,
  kycUserView,
}) {
  const router = Router();

  router.get('/me', auth, (req, res) => {
    res.json({
      user: publicUser(req.user),
      email: req.user.email,
      provider: req.user.provider,
      phone: req.user.phone,
      maxValue: req.user.maxValue,
      maxActive: req.user.maxActive,
      trainingDone: !!req.user.trainingDone,
      kycStatus: req.user.kycStatus,
      kyc: kycUserView(req.user),
    });
  });

  return router;
}
