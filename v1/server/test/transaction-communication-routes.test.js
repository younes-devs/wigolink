import assert from 'node:assert/strict';
import express from 'express';
import test from 'node:test';
import {
  createTransactionCommunicationsRouter,
} from '../routes/transaction-communications.js';

async function requestRoute({
  path,
  method = 'GET',
  body,
  auth = authenticated,
  transactionCommunications,
}) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.lang = 'ar';
    next();
  });
  app.use('/api', createTransactionCommunicationsRouter({
    auth,
    transactionCommunications,
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
      {
        method,
        headers: body ? { 'content-type': 'application/json' } : {},
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
  req.user = { id: 'user-1' };
  next();
}

test('routes communication transmettent id, membre, corps et langue', async () => {
  const calls = [];
  const transactionCommunications = {
    async messages(...args) {
      calls.push(['messages', ...args]);
      return { status: 200, body: { messages: [] } };
    },
    async sendMessage(...args) {
      calls.push(['sendMessage', ...args]);
      return { status: 422, body: { code: 'blocked' } };
    },
    customsRecap(...args) {
      calls.push(['customsRecap', ...args]);
      return { status: 404, body: { error: 'Annonce introuvable' } };
    },
  };

  const messages = await requestRoute({
    path: '/transactions/tx-1/messages',
    transactionCommunications,
  });
  const sent = await requestRoute({
    path: '/transactions/tx-1/messages',
    method: 'POST',
    body: { text: 'Bonjour' },
    transactionCommunications,
  });
  const recap = await requestRoute({
    path: '/transactions/tx-1/customs-recap',
    transactionCommunications,
  });

  assert.equal(messages.status, 200);
  assert.equal(sent.status, 422);
  assert.equal(recap.status, 404);
  assert.deepEqual(calls, [
    ['messages', 'tx-1', { id: 'user-1' }],
    ['sendMessage', 'tx-1', { id: 'user-1' }, { text: 'Bonjour' }],
    ['customsRecap', 'tx-1', { id: 'user-1' }, 'ar'],
  ]);
});

test('routes communication authentifient avant le service', async () => {
  let calls = 0;
  const response = await requestRoute({
    path: '/transactions/tx-1/messages',
    auth(_req, res) {
      res.status(401).json({ error: 'Non authentifie' });
    },
    transactionCommunications: {
      messages() {
        calls += 1;
      },
    },
  });

  assert.equal(response.status, 401);
  assert.equal(calls, 0);
});
