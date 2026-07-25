import { Router } from 'express';

function sendResult(res, result) {
  return res.status(result.status).json(result.body);
}

export function createTransactionCommunicationsRouter({
  auth,
  transactionCommunications,
}) {
  const router = Router();

  router.get('/transactions/:id/messages', auth, async (req, res) => {
    const result = await transactionCommunications.messages(
      req.params.id,
      req.user,
    );
    return sendResult(res, result);
  });

  router.post('/transactions/:id/messages', auth, async (req, res) => {
    const result = await transactionCommunications.sendMessage(
      req.params.id,
      req.user,
      req.body,
    );
    return sendResult(res, result);
  });

  router.get('/transactions/:id/customs-recap', auth, (req, res) => {
    const result = transactionCommunications.customsRecap(
      req.params.id,
      req.user,
      req.lang,
    );
    return sendResult(res, result);
  });

  return router;
}
