import assert from 'node:assert/strict';
import express from 'express';
import test from 'node:test';
import { createOperationReadsRouter } from '../routes/operation-reads.js';

async function requestRead({
  path,
  auth = authenticated,
  operationReads,
}) {
  const app = express();
  app.use('/api', createOperationReadsRouter({
    auth,
    operationReads,
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
      `http://127.0.0.1:${address.port}/api${path}`,
    );
    return {
      status: response.status,
      body: await response.json(),
    };
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
}

function authenticated(req, _res, next) {
  req.user = { id: 'u-1' };
  next();
}

test('operation read routes transmettent les deux listes', async () => {
  const calls = [];
  const operationReads = {
    operations(user, query) {
      calls.push(['operations', user, query]);
      return { operations: [] };
    },
    transactions(user, query) {
      calls.push(['transactions', user, query]);
      return { transactions: [] };
    },
  };

  await requestRead({
    path: '/operations?history=1',
    operationReads,
  });
  await requestRead({
    path: '/transactions?history=0',
    operationReads,
  });

  assert.deepEqual(calls, [
    ['operations', { id: 'u-1' }, { history: '1' }],
    ['transactions', { id: 'u-1' }, { history: '0' }],
  ]);
});

test('operation read routes conservent statuts des détails', async () => {
  const operationReads = {
    operation(id, user) {
      assert.equal(id, 'tx-1');
      assert.deepEqual(user, { id: 'u-1' });
      return {
        status: 404,
        body: { error: 'Operation introuvable' },
      };
    },
    transaction() {
      return {
        status: 403,
        body: { error: 'Non autorisé' },
      };
    },
  };

  const missing = await requestRead({
    path: '/operations/tx-1',
    operationReads,
  });
  const forbidden = await requestRead({
    path: '/transactions/tx-1',
    operationReads,
  });

  assert.equal(missing.status, 404);
  assert.equal(forbidden.status, 403);
});

test('operation read route transmet le centre envois', async () => {
  const response = await requestRead({
    path: '/shipments/command-center',
    operationReads: {
      commandCenter(user) {
        assert.deepEqual(user, { id: 'u-1' });
        return { commandCenter: { totals: { total: 2 } } };
      },
    },
  });

  assert.equal(response.body.commandCenter.totals.total, 2);
});

test('operation read routes authentifient avant service', async () => {
  let calls = 0;
  const response = await requestRead({
    path: '/operations',
    auth(_req, res) {
      res.status(401).json({ error: 'Non authentifié' });
    },
    operationReads: {
      operations() {
        calls += 1;
      },
    },
  });

  assert.equal(response.status, 401);
  assert.equal(calls, 0);
});
