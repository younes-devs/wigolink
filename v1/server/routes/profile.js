import { Router } from 'express';
import {
  validatePasswordChange,
  validateProfilePhoto,
  validateProfileUpdate,
} from '../validators/profile.js';

export function createProfileRouter({
  auth,
  auditChange,
  save,
  publicUser,
  verifyPassword,
  hashPassword,
  clearUserSessions,
  accountEmail,
  profileMedia = null,
  memberMediaUploads = null,
  allowInlineMediaFallback = true,
  validateUpdate = validateProfileUpdate,
  validatePhoto = validateProfilePhoto,
  validatePassword = validatePasswordChange,
}) {
  const router = Router();

  router.post('/photo/upload', auth, async (req, res) => {
    try {
      const value = await memberMediaUploads.reserveProfile({
        userId: req.user.id,
        mime: req.body?.mime,
        size: req.body?.size,
      });
      return res.json(value);
    } catch (error) {
      const invalid = /invalide|trop lourde/i.test(error?.message || '');
      return res.status(invalid ? 400 : 503).json({
        error: invalid
          ? 'Image invalide ou trop lourde'
          : 'Le stockage des photos est temporairement indisponible',
      });
    }
  });

  router.post('/', auth, async (req, res) => {
    const validation = validateUpdate(req.body);
    if (validation.error) {
      return res.status(validation.status).json({ error: validation.error });
    }

    const before = { ...req.user };
    Object.assign(req.user, validation.value);
    await auditChange({
      actorId: req.user.id,
      action: 'profile.update',
      targetType: 'user',
      targetId: req.user.id,
      subjectUserId: req.user.id,
      before,
      after: req.user,
      fields: ['name', 'city', 'phone'],
    });
    save();
    return res.json({ user: publicUser(req.user) });
  });

  router.post('/photo', auth, async (req, res) => {
    const directUpload = String(req.body?.uploadId || '').trim();
    const validation = directUpload ? { value: undefined } : validatePhoto(req.body.dataUrl);
    if (validation.error) {
      return res.status(validation.status).json({ error: validation.error });
    }

    const previousPhotoUrl = req.user.photoUrl || null;
    const before = { hasPhoto: !!previousPhotoUrl };
    let claimedUpload = null;
    try {
      if (validation.value === null) {
        await profileMedia?.removePublicUrl(req.user.id, previousPhotoUrl);
        await profileMedia?.remove(req.user.id);
        req.user.photoUrl = null;
      } else if (directUpload) {
        claimedUpload = await memberMediaUploads.claimProfile({
          userId: req.user.id,
          uploadId: directUpload,
        });
        req.user.photoUrl = claimedUpload.url;
      } else if (profileMedia?.enabled) {
        req.user.photoUrl = await profileMedia.storeDataUrl({
          userId: req.user.id,
          dataUrl: validation.value,
        });
      } else if (allowInlineMediaFallback) {
        req.user.photoUrl = validation.value;
      } else {
        return res.status(503).json({
          error: 'Le stockage des photos est temporairement indisponible',
        });
      }
    } catch {
      return res.status(503).json({
        error: 'Le stockage des photos est temporairement indisponible',
      });
    }
    try {
      await auditChange({
        actorId: req.user.id,
        action: 'profile.photo.update',
        targetType: 'user',
        targetId: req.user.id,
        subjectUserId: req.user.id,
        before,
        after: { hasPhoto: !!req.user.photoUrl },
        fields: ['hasPhoto'],
      });
      await save();
    } catch {
      req.user.photoUrl = previousPhotoUrl;
      if (claimedUpload) {
        await memberMediaUploads.cancel(claimedUpload.uploadId).catch(() => {});
      }
      return res.status(503).json({
        error: 'La photo de profil n a pas pu etre enregistree',
      });
    }
    if (claimedUpload) {
      await memberMediaUploads.complete(claimedUpload.uploadId).catch(() => {});
      await profileMedia?.removePublicUrl(req.user.id, previousPhotoUrl);
    }
    return res.json({ user: publicUser(req.user) });
  });

  router.post('/password', auth, async (req, res) => {
    const validation = validatePassword(req.body, {
      passwordHash: req.user.passwordHash,
      verifyPassword,
    });
    if (validation.error) {
      return res.status(validation.status).json({ error: validation.error });
    }

    req.user.passwordHash = hashPassword(validation.value.password);
    await clearUserSessions(req.user.id);
    await auditChange({
      actorId: req.user.id,
      action: 'profile.password.update',
      targetType: 'user',
      targetId: req.user.id,
      subjectUserId: req.user.id,
      before: {},
      after: {},
      fields: [],
      meta: { recordEmpty: true },
    });
    save();
    return res.json({ ok: true, mustRelogin: true });
  });

  router.post('/email/change/request', auth, async (req, res) => {
    const result = await accountEmail.requestChange({
      user: req.user,
      body: req.body,
      lang: req.lang,
    });
    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }
    return res.json(result.value);
  });

  router.post('/email/change/confirm', auth, async (req, res) => {
    const result = await accountEmail.confirmChange({
      user: req.user,
      body: req.body,
    });
    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }
    return res.json(result.value);
  });

  return router;
}
