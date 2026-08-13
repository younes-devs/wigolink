import { Router } from 'express';

export function createAdminActionsRouter({
  auth,
  adminOnly,
  adminActions,
}) {
  const router = Router();
  const protect = [auth, adminOnly];

  function sendResult(res, result) {
    return res.status(result.status).json(result.body);
  }

  router.post(
    '/admin/users/:id/case-file/access',
    ...protect,
    async (req, res) => sendResult(
      res,
      await adminActions.recordCaseAccess(
        req.user,
        req.params.id,
        req.body,
      ),
    ),
  );

  router.post(
    '/admin/users/:id/role',
    ...protect,
    async (req, res) => sendResult(
      res,
      await adminActions.changeRole(
        req.user,
        req.params.id,
        req.body,
      ),
    ),
  );

  router.post(
    '/admin/users/:id/safety',
    ...protect,
    async (req, res) => sendResult(
      res,
      await adminActions.moderateUser(
        req.user,
        req.params.id,
        req.body,
      ),
    ),
  );

  router.get(
    '/admin/users/:id/trips',
    ...protect,
    async (req, res) => sendResult(
      res,
      await adminActions.listMemberTrips(
        req.user,
        req.params.id,
        req.query,
      ),
    ),
  );

  router.post(
    '/admin/users/:id/trips/:tripId/remove',
    ...protect,
    async (req, res) => sendResult(
      res,
      await adminActions.removeMemberTrip(
        req.user,
        req.params.id,
        req.params.tripId,
        req.body,
      ),
    ),
  );

  // A suspended member may appeal with the existing session token.
  router.post('/safety/appeals', async (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    return sendResult(
      res,
      await adminActions.submitAppeal(token, req.body),
    );
  });

  router.post(
    '/admin/safety/appeals/:id',
    ...protect,
    async (req, res) => sendResult(
      res,
      await adminActions.reviewAppeal(
        req.user,
        req.params.id,
        req.body,
      ),
    ),
  );

  router.delete(
    '/admin/whitelist/:id',
    ...protect,
    async (req, res) => sendResult(
      res,
      await adminActions.removeWhitelist(
        req.user,
        req.params.id,
      ),
    ),
  );

  router.post(
    '/admin/kyc/:id/decide',
    ...protect,
    async (req, res) => sendResult(
      res,
      await adminActions.decideKyc(
        req.user,
        req.params.id,
        req.body,
      ),
    ),
  );

  return router;
}
