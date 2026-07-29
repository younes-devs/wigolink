import { Router } from 'express';
import { validateKycSubmission } from '../validators/kyc.js';

export function createKycRouter({
  auth,
  kycRepository,
  kycMedia = null,
  save,
  kycUserView,
  validPhotos,
  maxAttempts,
  persistUser = null,
  validateSubmission = validateKycSubmission,
}) {
  const router = Router();

  router.post('/submit', auth, async (req, res) => {
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

    const rejectedCount = await kycRepository.rejectedCountForUser(req.user.id);
    if (rejectedCount >= maxAttempts) {
      return res.status(403).json({
        error: 'Nombre maximum de tentatives atteint — contactez le support',
      });
    }

    try {
      const storedPhotos = kycMedia?.enabled
        ? await kycMedia.storeSubmission({
          userId: req.user.id,
          photos: validation.value,
        })
        : {
          selfiePhoto: validation.value.selfiePhoto,
          idFrontPhoto: validation.value.idFrontPhoto,
          idBackPhoto: validation.value.idBackPhoto,
        };
      const submissionData = {
        userId: req.user.id,
        ...validation.value,
        ...storedPhotos,
      };
      const previousUser = { ...req.user };
      req.user.kycStatus = 'pending';
      if (typeof kycRepository.submitForUser === 'function') {
        await kycRepository.submitForUser(submissionData, req.user);
      } else {
        await kycRepository.appendSubmission(submissionData);
        if (persistUser) await persistUser(req.user, previousUser);
      }
      await save();
      return res.json({ kyc: await kycUserView(req.user) });
    } catch {
      return res.status(503).json({
        error: 'Le stockage securise des documents est temporairement indisponible',
      });
    }
  });

  return router;
}
