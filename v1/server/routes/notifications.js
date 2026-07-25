import { Router } from 'express';

export function createNotificationsRouter({
  auth,
  notifications,
  runMatchingOfferReminders,
  renderNotification,
  save,
}) {
  const router = Router();

  router.get('/', auth, async (req, res) => {
    await runMatchingOfferReminders({ persist: true });
    const mine = (await notifications.listForUser(req.user.id, { limit: 30 }))
      .map((notification) => ({
        ...notification,
        text: renderNotification(req.lang, notification),
      }));
    res.json({
      notifications: mine,
      unread: await notifications.unreadCount(req.user.id),
    });
  });

  router.post('/read', auth, async (req, res) => {
    await notifications.markAllRead(req.user.id);
    save();
    res.json({ ok: true });
  });

  return router;
}
