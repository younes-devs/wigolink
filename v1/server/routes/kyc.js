import { Router } from 'express';
import { validateKycSubmission } from '../validators/kyc.js';

export function createKycRouter({
  auth,
  kycRepository,
  kycMedia = null,
  memberMediaUploads = null,
  save,
  kycUserView,
  validPhotos,
  maxAttempts,
  persistUser = null,
  validateSubmission = validateKycSubmission,
}) {
  const router = Router();

  router.post('/uploads', auth, async (req, res) => {
    try {
      const value = await memberMediaUploads.reserveKyc({
        userId: req.user.id,
        photos: req.body?.photos,
      });
      return res.json(value);
    } catch (error) {
      const invalid = /invalide|trop lourde/i.test(error?.message || '');
      return res.status(invalid ? 400 : 503).json({
        error: invalid
          ? 'Images KYC invalides'
          : 'Le stockage securise des documents est temporairement indisponible',
      });
    }
  });

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
    if (req.body?.uploadId) {
      const uploadId = String(req.body.uploadId);
      const directFields = ['selfiePhoto', 'idFrontPhoto', 'idBackPhoto']
        .filter((field) => !!validation.value[field]);
      const validDirectReferences = /^media-[a-f0-9-]{36}$/.test(uploadId)
        && directFields.every((field) => (
          validation.value[field]
          && typeof validation.value[field] === 'object'
          && validation.value[field].uploadId === uploadId
          && validation.value[field].field === field
        ));
      if (!validDirectReferences) {
        return res.status(400).json({ error: 'Reservation KYC invalide' });
      }
    }

    const rejectedCount = await kycRepository.rejectedCountForUser(req.user.id);
    if (rejectedCount >= maxAttempts) {
      return res.status(403).json({
        error: 'Nombre maximum de tentatives atteint — contactez le support',
      });
    }

    let claimedUpload = null;
    let persisted = false;
    try {
      if (req.body?.uploadId) {
        claimedUpload = await memberMediaUploads.claimKyc({
          userId: req.user.id,
          uploadId: req.body.uploadId,
          fields: ['selfiePhoto', 'idFrontPhoto', 'idBackPhoto']
            .filter((field) => !!validation.value[field]),
        });
      }
      const storedPhotos = claimedUpload?.photos || (kycMedia?.enabled
        ? await kycMedia.storeSubmission({
          userId: req.user.id,
          photos: validation.value,
        })
        : {
          selfiePhoto: validation.value.selfiePhoto,
          idFrontPhoto: validation.value.idFrontPhoto,
          idBackPhoto: validation.value.idBackPhoto,
        });
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
      persisted = true;
      await save();
      if (claimedUpload) await memberMediaUploads.complete(claimedUpload.uploadId).catch(() => {});
      return res.json({ kyc: await kycUserView(req.user) });
    } catch {
      if (claimedUpload && !persisted) {
        await memberMediaUploads.cancel(claimedUpload.uploadId).catch(() => {});
      }
      return res.status(503).json({
        error: 'Le stockage securise des documents est temporairement indisponible',
      });
    }
  });

  return router;
}
