import { Router } from 'express';

export function createConversationInboxRouter({
  auth,
  inbox,
}) {
  const router = Router();

  router.get('/conversations', auth, (req, res) => {
    res.json(inbox.list(req.user, req.query));
  });

  router.get('/conversations/:id', auth, (req, res) => {
    const result = inbox.detail(req.params.id, req.user.id);
    if (!result) return res.status(404).json({ error: 'Conversation introuvable' });
    return res.json(result);
  });

  router.get('/conversations/:id/messages', auth, (req, res) => {
    const result = inbox.messages(req.params.id, req.user.id, req.query);
    if (!result) return res.status(404).json({ error: 'Conversation introuvable' });
    return res.json(result);
  });

  router.post('/conversations/:id/read', auth, (req, res) => {
    const result = inbox.markRead(req.params.id, req.user.id);
    if (!result) return res.status(404).json({ error: 'Conversation introuvable' });
    return res.json(result);
  });

  router.post('/conversations/:id/typing', auth, (req, res) => {
    const found = inbox.typing(req.params.id, req.user.id, req.body?.active);
    if (!found) return res.status(404).json({ error: 'Conversation introuvable' });
    return res.json({ ok: true });
  });

  router.post('/conversations/:id/unread', auth, (req, res) => {
    const result = inbox.markUnread(req.params.id, req.user.id);
    if (!result) return res.status(404).json({ error: 'Conversation introuvable' });
    return res.json(result);
  });

  router.post('/conversations/:id/archive', auth, (req, res) => {
    const result = inbox.archive(
      req.params.id,
      req.user.id,
      req.body?.archived !== false,
    );
    if (!result) return res.status(404).json({ error: 'Conversation introuvable' });
    return res.json(result);
  });

  router.post('/conversations/:id/pin', auth, (req, res) => {
    const result = inbox.pin(
      req.params.id,
      req.user.id,
      req.body?.pinned !== false,
    );
    if (!result) return res.status(404).json({ error: 'Conversation introuvable' });
    return res.json(result);
  });

  router.post('/conversations/:id/block', auth, async (req, res) => {
    const result = await inbox.block(
      req.params.id,
      req.user,
      req.body?.blocked !== false,
    );
    if (result.notFound) {
      return res.status(404).json({ error: 'Conversation introuvable' });
    }
    if (result.invalidParticipant) {
      return res.status(400).json({ error: 'Participant introuvable' });
    }
    return res.json(result);
  });

  router.get('/blocked-users', auth, (req, res) => {
    res.json(inbox.listBlocked(req.user));
  });

  router.post('/blocked-users/:id/unblock', auth, async (req, res) => {
    const found = await inbox.unblock(req.user, req.params.id);
    if (!found) {
      return res.status(404).json({ error: 'Compte bloque introuvable' });
    }
    return res.json({ ok: true });
  });

  router.delete('/conversations/:id', auth, async (req, res) => {
    const found = await inbox.remove(req.params.id, req.user.id);
    if (!found) return res.status(404).json({ error: 'Conversation introuvable' });
    return res.json({ ok: true });
  });

  return router;
}
