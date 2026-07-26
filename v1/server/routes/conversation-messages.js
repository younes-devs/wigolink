import { Router } from 'express';

export function createConversationMessageRouter({
  auth,
  messages,
}) {
  const router = Router();

  function sendResult(res, result) {
    return res.status(result.status).json(result.body);
  }

  router.post('/conversations', auth, (req, res) => {
    return sendResult(
      res,
      messages.createConversation(req.user, req.body),
    );
  });

  router.post('/conversations/:id/report', auth, async (req, res) => {
    return sendResult(
      res,
      await messages.reportConversation(
        req.params.id,
        req.user,
        req.body,
      ),
    );
  });

  router.post('/conversations/:id/messages', auth, async (req, res) => {
    return sendResult(
      res,
      await messages.sendMessage(
        req.params.id,
        req.user,
        req.body,
      ),
    );
  });

  router.delete(
    '/conversations/:id/messages/:messageId',
    auth,
    (req, res) => sendResult(
      res,
      messages.deleteMessage(
        req.params.id,
        req.params.messageId,
        req.user.id,
      ),
    ),
  );

  router.get(
    '/conversations/:id/messages/:messageId/attachments/:attachmentId',
    auth,
    async (req, res) => {
      const result = await messages.attachment(
        req.params.id,
        req.params.messageId,
        req.params.attachmentId,
        req.user.id,
      );
      if (result.status !== 200) {
        return res.status(result.status || 404).json({
          error: result.status === 503 ? 'Media temporairement indisponible' : 'Media introuvable',
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
