import { Router } from 'express';
import { validateKycSubmission } from '../validators/kyc.js';

export function createKycRouter({
  auth,
  kycRepository,
  save,
  kycUserView,
  validPhotos,
  maxAttempts,
  validateSubmission = validateKycSubmission,
}) {
  const router = Router();

  router.post('/submit', auth, (req, res) => {
    if (req.user.kycStatus === 'verified') {
      return res.status(400).json({ error: 'Votre identité est déjà vérifiée' });
    }
    if (req.user.kycStatus === 'pending') {
      return res.status(400).json({ error: 'Une demande est déjà en cours de vérification' });
    }
    if (req.user.kycStatus === 'refused') {
      return res.status(403).json({
        error: 'Vérification définitivement refusée — contactez le support',
      });
    }

    const validation = validateSubmission(req.body, { validPhotos });
    if (validation.error) {
      return res.status(validation.status).json({ error: validation.error });
    }

    const rejectedCount = kycRepository.rejectedCountForUser(req.user.id);
    if (rejectedCount >= maxAttempts) {
      return res.status(403).json({
        error: 'Nombre maximum de tentatives atteint — contactez le support',
      });
    }

    kycRepository.appendSubmission({
      userId: req.user.id,
      ...validation.value,
    });
    req.user.kycStatus = 'pending';
    save();
    return res.json({ kyc: kycUserView(req.user) });
  });

  return router;
}
