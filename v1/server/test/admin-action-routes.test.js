import assert from 'node:assert/strict';
import express from 'express';
import test from 'node:test';
import { createAdminActionsRouter } from '../routes/admin-actions.js';

async function requestAction({
  path,
  method = 'POST',
  body,
  token = 'session-token',
  auth = authenticated,
  adminOnly = authorizedAdmin,
  adminActions,
}) {
  const app = express();
  app.use(express.json());
  app.use('/api', createAdminActionsRouter({
    auth,
    adminOnly,
    adminActions,
  }));
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  try {
    const address = server.address();
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api${path}`,
      {
        method,
        headers: {
          authorization: `Bearer ${token}`,
          ...(body ? { 'content-type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      },
    );
    return {
      status: response.status,
      body: await response.json(),
    };
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

function authenticated(req, _res, next) {
  req.user = { id: 'admin', isAdmin: true };
  next();
}

function authorizedAdmin(_req, _res, next) {
  next();
}

function successResult() {
  return { status: 200, body: { ok: true } };
}

test('routes actions transmettent acteur, identifiant et corps', async () => {
  const calls = [];
  const adminActions = {
    async recordCaseAccess(...args) {
      calls.push(['case', ...args]);
      return successResult();
    },
    async changeRole(...args) {
      calls.push(['role', ...args]);
      return successResult();
    },
    async moderateUser(...args) {
      calls.push(['safety', ...args]);
      return successResult();
    },
    async submitAppeal(...args) {
      calls.push(['submitAppeal', ...args]);
      return successResult();
    },
    async reviewAppeal(...args) {
      calls.push(['reviewAppeal', ...args]);
      return successResult();
    },
    async removeWhitelist(...args) {
      calls.push(['whitelist', ...args]);
      return successResult();
    },
    async decideKyc(...args) {
      calls.push(['kyc', ...args]);
      return successResult();
    },
  };
  const actor = { id: 'admin', isAdmin: true };

  await requestAction({
    path: '/admin/users/member/case-file/access',
    body: { section: 'messages' },
    adminActions,
  });
  await requestAction({
    path: '/admin/users/member/role',
    body: { role: 'admin' },
    adminActions,
  });
  await requestAction({
    path: '/admin/users/member/safety',
    body: { action: 'warn' },
    adminActions,
  });
  await requestAction({
    path: '/safety/appeals',
    body: { reason: 'explication' },
    adminActions,
  });
  await requestAction({
    path: '/admin/safety/appeals/appeal-1',
    body: { decision: 'approve' },
    adminActions,
  });
  await requestAction({
    path: '/admin/whitelist/rare',
    method: 'DELETE',
    adminActions,
  });
  await requestAction({
    path: '/admin/kyc/kyc-1/decide',
    body: { decision: 'approve' },
    adminActions,
  });

  assert.deepEqual(calls, [
    ['case', actor, 'member', { section: 'messages' }],
    ['role', actor, 'member', { role: 'admin' }],
    ['safety', actor, 'member', { action: 'warn' }],
    [
      'submitAppeal',
      'session-token',
      { reason: 'explication' },
    ],
    [
      'reviewAppeal',
      actor,
      'appeal-1',
      { decision: 'approve' },
    ],
    ['whitelist', actor, 'rare'],
    ['kyc', actor, 'kyc-1', { decision: 'approve' }],
  ]);
});

test('routes admin bloquent membre avant le service', async () => {
  const order = [];
  const response = await requestAction({
    path: '/admin/users/member/role',
    body: { role: 'admin' },
    auth(req, _res, next) {
      order.push('auth');
      req.user = { id: 'member' };
      next();
    },
    adminOnly(_req, res) {
      order.push('adminOnly');
      res.status(403).json({ error: 'Accès refusé' });
    },
    adminActions: {
      changeRole() {
        order.push('service');
      },
    },
  });

  assert.equal(response.status, 403);
  assert.deepEqual(order, ['auth', 'adminOnly']);
});

test('route recours contourne auth admin et transmet la session', async () => {
  let received;
  const response = await requestAction({
    path: '/safety/appeals',
    body: { reason: 'explication longue' },
    auth() {
      assert.fail('auth normal ne doit pas être utilisé');
    },
    adminOnly() {
      assert.fail('adminOnly ne doit pas être utilisé');
    },
    adminActions: {
      async submitAppeal(token, body) {
        received = { token, body };
        return successResult();
      },
    },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(received, {
    token: 'session-token',
    body: { reason: 'explication longue' },
  });
});
