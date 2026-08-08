import { Router } from 'express';

const AUDITED_NOTIFICATION_FIELDS = [
  'transactions',
  'shipments',
  'reminders',
];

export function createAccountSettingsRouter({
  auth,
  settings,
  auditChange,
  publicUser,
  save,
}) {
  const router = Router();

  router.get('/settings', auth, (req, res) => {
    res.json({ settings: settings.ensure(req.user) });
  });

  router.post('/settings', auth, async (req, res) => {
    const before = { ...settings.ensure(req.user).notifications };
    const input = req.body?.notifications || {};
    settings.updateNotifications(req.user, input);
    await auditChange({
      actorId: req.user.id,
      action: 'settings.notifications.update',
      targetType: 'user',
      targetId: req.user.id,
      subjectUserId: req.user.id,
      before,
      after: settings.ensure(req.user).notifications,
      fields: AUDITED_NOTIFICATION_FIELDS,
    });
    save();
    res.json({ settings: settings.ensure(req.user) });
  });

  router.post('/onboarding/complete', auth, (req, res) => {
    settings.markOnboardingDone(req.user);
    save();
    res.json({
      user: publicUser(req.user),
      settings: settings.ensure(req.user),
    });
  });

  return router;
}
