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

  return router;
}
