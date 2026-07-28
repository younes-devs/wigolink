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
  app.use('/api', createOperationReadsRouter({ auth, operationReads }));
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/api${path}`);
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
  req.user = { id: 'u-1' };
  next();
}

test('operation routes forward list and detail requests', async () => {
  const calls = [];
  const operationReads = {
    operations(user, query) {
      calls.push(['list', user, query]);
      return { operations: [] };
    },
    operation(id, user) {
      calls.push(['detail', id, user]);
      return {
        status: 404,
        body: { error: 'Operation introuvable' },
      };
    },
  };

  const list = await requestRead({
    path: '/operations?history=1',
    operationReads,
  });
  const detail = await requestRead({
    path: '/operations/tx-1',
    operationReads,
  });

  assert.equal(list.status, 200);
  assert.equal(detail.status, 404);
  assert.deepEqual(calls, [
    ['list', { id: 'u-1' }, { history: '1' }],
    ['detail', 'tx-1', { id: 'u-1' }],
  ]);
});

test('operation routes authenticate before calling the service', async () => {
  let calls = 0;
  const response = await requestRead({
    path: '/operations',
    auth(_req, res) {
      res.status(401).json({ error: 'Non authentifie' });
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
