import assert from 'node:assert/strict';
import express from 'express';
import test from 'node:test';
import { createAdminFraudRouter } from '../routes/admin-fraud.js';

async function requestFraud({
  auth = authenticated,
  adminOnly = authorizedAdmin,
  adminFraud,
}) {
  const app = express();
  app.use('/api', createAdminFraudRouter({
    auth,
    adminOnly,
    adminFraud,
  }));
  const server = await new Promise((resolve) => {
    const listening = app.listen(
      0,
      '127.0.0.1',
      () => resolve(listening),
    );
  });
  try {
    const address = server.address();
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/admin/fraud`,
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

test('route fraude renvoie le detail du service', async () => {
  let calls = 0;
  const response = await requestFraud({
    adminFraud: {
      async details() {
        calls += 1;
        return { linkedAccounts: [], repeatPairs: [] };
      },
    },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    linkedAccounts: [],
    repeatPairs: [],
  });
  assert.equal(calls, 1);
});

test('route fraude applique auth puis admin avant le service', async () => {
  const order = [];
  const response = await requestFraud({
    auth(_req, _res, next) {
      order.push('auth');
      next();
    },
    adminOnly(_req, res) {
      order.push('admin');
      res.status(403).json({ error: 'Acces admin requis' });
    },
    adminFraud: {
      details() {
        order.push('service');
      },
    },
  });

  assert.equal(response.status, 403);
  assert.deepEqual(order, ['auth', 'admin']);
});
