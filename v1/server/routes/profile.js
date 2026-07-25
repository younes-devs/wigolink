import { Router } from 'express';
import {
  validateProfilePhoto,
  validateProfileUpdate,
} from '../validators/profile.js';

export function createProfileRouter({
  auth,
  auditChange,
  save,
  publicUser,
  validateUpdate = validateProfileUpdate,
  validatePhoto = validateProfilePhoto,
}) {
  const router = Router();

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
    const validation = validatePhoto(req.body.dataUrl);
    if (validation.error) {
      return res.status(validation.status).json({ error: validation.error });
    }

    const before = { hasPhoto: !!req.user.photoUrl };
    req.user.photoUrl = validation.value;
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
    save();
    return res.json({ user: publicUser(req.user) });
  });

  return router;
}
