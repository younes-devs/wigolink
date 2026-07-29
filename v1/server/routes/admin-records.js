import { Router } from 'express';

export function createAdminRecordsRouter({
  auth,
  adminOnly,
  adminRecords,
}) {
  const router = Router();
  const protect = [auth, adminOnly];

  function sendResult(res, result) {
    return res.status(result.status).json(result.body);
  }

  router.get('/admin/users', ...protect, (req, res) => {
    res.json(adminRecords.users(req.query));
  });

  router.get('/admin/users/:id/case-file', ...protect, async (req, res) => {
    return sendResult(
      res,
      await adminRecords.caseFile(req.params.id, req.query),
    );
  });

  router.get('/admin/audit-logs', ...protect, async (req, res) => {
    res.json(await adminRecords.auditLogs(req.query));
  });

  router.get('/admin/kyc', ...protect, async (req, res) => {
    res.json(await adminRecords.kycList(req.query));
  });

  router.get('/admin/kyc/:id', ...protect, async (req, res) => {
    return sendResult(
      res,
      await adminRecords.kycDetail(req.params.id),
    );
  });

  router.get('/admin/safety', ...protect, (_req, res) => {
    res.json(adminRecords.safety());
  });

  return router;
}
