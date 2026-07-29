import { Router } from 'express';

export function createRelationalMessageWriteRouter({
  auth,
  enabled,
  writer,
  today,
}) {
  const router = Router();

  router.post('/conversations/:id/attachments/upload', auth, async (req, res, next) => {
    if (!enabled()) return next('route');
    const result = await writer.createAttachmentUpload({
      user: req.user,
      conversationId: req.params.id,
      body: req.body,
    });
    return res.status(result.status).json(result.body);
  });

  router.post('/conversations/:id/messages', auth, async (req, res, next) => {
    if (!enabled()) return next('route');
    const result = await writer.send({
      user: req.user,
      conversationId: req.params.id,
      body: req.body,
      today: today(),
    });
    return res.status(result.status).json(result.body);
  });

  router.post('/conversations/:id/read', auth, async (req, res, next) => {
    if (!enabled()) return next('route');
    const result = await writer.markRead({
      user: req.user,
      conversationId: req.params.id,
      today: today(),
    });
    return res.status(result.status).json(result.body);
  });

  router.post('/conversations/:id/unread', auth, async (req, res, next) => {
    if (!enabled()) return next('route');
    const result = await writer.markUnread({
      user: req.user,
      conversationId: req.params.id,
      today: today(),
    });
    return res.status(result.status).json(result.body);
  });

  router.post('/conversations/:id/archive', auth, async (req, res, next) => {
    if (!enabled()) return next('route');
    const result = await writer.archive({
      user: req.user,
      conversationId: req.params.id,
      active: req.body?.archived !== false,
      today: today(),
    });
    return res.status(result.status).json(result.body);
  });

  router.post('/conversations/:id/pin', auth, async (req, res, next) => {
    if (!enabled()) return next('route');
    const result = await writer.pin({
      user: req.user,
      conversationId: req.params.id,
      active: req.body?.pinned !== false,
      today: today(),
    });
    return res.status(result.status).json(result.body);
  });

  router.post('/conversations/:id/typing', auth, async (req, res, next) => {
    if (!enabled()) return next('route');
    const result = await writer.typing({
      user: req.user,
      conversationId: req.params.id,
      active: req.body?.active,
    });
    return res.status(result.status).json(result.body);
  });

  router.delete('/conversations/:id', auth, async (req, res, next) => {
    if (!enabled()) return next('route');
    const result = await writer.removeConversation({
      user: req.user,
      conversationId: req.params.id,
    });
    return res.status(result.status).json(result.body);
  });

  router.delete('/conversations/:id/messages/:messageId', auth, async (req, res, next) => {
    if (!enabled()) return next('route');
    const result = await writer.remove({
      user: req.user,
      conversationId: req.params.id,
      messageId: req.params.messageId,
      today: today(),
    });
    return res.status(result.status).json(result.body);
  });

  router.get(
    '/conversations/:id/messages/:messageId/attachments/:attachmentId',
    auth,
    async (req, res, next) => {
      if (!enabled()) return next('route');
      const result = await writer.attachment({
        user: req.user,
        conversationId: req.params.id,
        messageId: req.params.messageId,
        attachmentId: req.params.attachmentId,
      });
      if (result.status !== 200) {
        return res.status(result.status || 404).json({
          error: result.status === 503
            ? 'Media temporairement indisponible'
            : 'Media introuvable',
        });
      }
      res.setHeader('Content-Type', result.contentType);
      res.setHeader('Cache-Control', 'private, max-age=86400, immutable');
      if (result.etag) res.setHeader('ETag', result.etag);
      return res.send(result.body);
    },
  );

  return router;
}
