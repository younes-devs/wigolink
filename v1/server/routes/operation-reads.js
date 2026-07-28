import { Router } from 'express';

export function createOperationReadsRouter({
  auth,
  operationReads,
}) {
  const router = Router();

  function sendResult(res, result) {
    return res.status(result.status).json(result.body);
  }

  router.get('/operations', auth, (req, res) => {
    res.json(operationReads.operations(req.user, req.query));
  });

  router.get('/operations/:id', auth, (req, res) => {
    return sendResult(
      res,
      operationReads.operation(req.params.id, req.user),
    );
  });

  return router;
}
