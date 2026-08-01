import { Router } from 'express';

export function createAccountPrivacyRouter({
  auth,
  accountPrivacy,
}) {
  const router = Router();

  router.post('/delete/request', auth, async (req, res) => {
    const result = await accountPrivacy.requestDeletion({
      user: req.user,
      lang: req.lang,
    });
    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }
    return res.json(result.value);
  });

  router.get('/export', auth, async (req, res) => {
    const data = await accountPrivacy.exportData(req.user);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="wigolink-donnees-${req.user.id}.json"`,
    );
    return res.json(data);
  });

  router.post('/delete', auth, async (req, res) => {
    const result = await accountPrivacy.deleteAccount({
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
