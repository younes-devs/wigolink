import assert from 'node:assert/strict';
import express from 'express';
import test from 'node:test';
import { createAdminRecordsRouter } from '../routes/admin-records.js';

async function requestAdmin({
  path,
  auth = authenticated,
  adminOnly = authorizedAdmin,
  adminRecords,
}) {
  const app = express();
  app.use('/api', createAdminRecordsRouter({
    auth,
    adminOnly,
    adminRecords,
  }));
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  try {
    const address = server.address();
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api${path}`,
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

test('routes admin transmettent identifiants et requêtes', async () => {
  const calls = [];
  const adminRecords = {
    users(query) {
      calls.push(['users', query]);
      return { users: [] };
    },
    async caseFile(id, query) {
      calls.push(['caseFile', id, query]);
      return { status: 200, body: { caseFile: {} } };
    },
    async auditLogs(query) {
      calls.push(['auditLogs', query]);
      return { logs: [] };
    },
    kycList(query) {
      calls.push(['kycList', query]);
      return { submissions: [] };
    },
    kycDetail(id) {
      calls.push(['kycDetail', id]);
      return { status: 200, body: { submission: {} } };
    },
    safety() {
      calls.push(['safety']);
      return { riskyUsers: [] };
    },
  };

  await requestAdmin({ path: '/admin/users?q=alice', adminRecords });
  await requestAdmin({
    path: '/admin/users/u-1/case-file?limit=20',
    adminRecords,
  });
  await requestAdmin({ path: '/admin/audit-logs?limit=10', adminRecords });
  await requestAdmin({ path: '/admin/kyc?status=pending', adminRecords });
  await requestAdmin({ path: '/admin/kyc/kyc-1', adminRecords });
  await requestAdmin({ path: '/admin/safety', adminRecords });

  assert.deepEqual(calls, [
    ['users', { q: 'alice' }],
    ['caseFile', 'u-1', { limit: '20' }],
    ['auditLogs', { limit: '10' }],
    ['kycList', { status: 'pending' }],
    ['kycDetail', 'kyc-1'],
    ['safety'],
  ]);
});

test('routes admin conservent les statuts de service', async () => {
  const missingCase = await requestAdmin({
    path: '/admin/users/missing/case-file',
    adminRecords: {
      async caseFile() {
        return {
          status: 404,
          body: { error: 'Membre introuvable' },
        };
      },
    },
  });
  const missingKyc = await requestAdmin({
    path: '/admin/kyc/missing',
    adminRecords: {
      kycDetail() {
        return {
          status: 404,
          body: { error: 'Demande introuvable' },
        };
      },
    },
  });

  assert.equal(missingCase.status, 404);
  assert.equal(missingKyc.status, 404);
});

test('routes admin appliquent auth puis adminOnly avant le service', async () => {
  const order = [];
  const deniedAuth = await requestAdmin({
    path: '/admin/users',
    auth(_req, res) {
      order.push('auth');
      res.status(401).json({ error: 'Non authentifié' });
    },
    adminOnly() {
      order.push('admin');
    },
    adminRecords: {
      users() {
        order.push('service');
      },
    },
  });

  assert.equal(deniedAuth.status, 401);
  assert.deepEqual(order, ['auth']);

  const deniedMember = await requestAdmin({
    path: '/admin/users',
    auth(req, _res, next) {
      order.push('auth-member');
      req.user = { id: 'member', isAdmin: false };
      next();
    },
    adminOnly(_req, res) {
      order.push('admin-member');
      res.status(403).json({ error: 'Accès administrateur requis' });
    },
    adminRecords: {
      users() {
        order.push('service-member');
      },
    },
  });

  assert.equal(deniedMember.status, 403);
  assert.deepEqual(order, [
    'auth',
    'auth-member',
    'admin-member',
  ]);
});
