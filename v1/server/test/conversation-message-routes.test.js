import assert from 'node:assert/strict';
import express from 'express';
import test from 'node:test';
import { createConversationMessageRouter } from '../routes/conversation-messages.js';

async function requestMessages({
  method = 'POST',
  path = '/conversations',
  body = {},
  auth,
  messages,
}) {
  const app = express();
  app.use(express.json());
  app.use('/api', createConversationMessageRouter({ auth, messages }));
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });

  try {
    const address = server.address();
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api${path}`,
      {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: method === 'DELETE' ? undefined : JSON.stringify(body),
      },
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

test('conversation message routes transmet les parametres au service', async () => {
  const calls = [];
  const messages = {
    createConversation(user, body) {
      calls.push(['create', user, body]);
      return {
        status: 201,
        body: { conversation: { id: 'conv-1' } },
      };
    },
    async sendMessage(id, user, body) {
      calls.push(['send', id, user, body]);
      return {
        status: 202,
        body: { message: { id: 'm-1' } },
      };
    },
  };

  const created = await requestMessages({
    auth: authenticated,
    messages,
    body: { userId: 'u-2' },
  });
  assert.equal(created.status, 201);

  const sent = await requestMessages({
    path: '/conversations/conv-1/messages',
    auth: authenticated,
    messages,
    body: { text: 'Bonjour' },
  });
  assert.equal(sent.status, 202);
  assert.deepEqual(calls, [
    ['create', { id: 'u-1' }, { userId: 'u-2' }],
    ['send', 'conv-1', { id: 'u-1' }, { text: 'Bonjour' }],
  ]);
});

test('conversation message routes conserve statut et corps des refus du service', async () => {
  const response = await requestMessages({
    path: '/conversations/conv-1/report',
    auth: authenticated,
    messages: {
      async reportConversation() {
        return {
          status: 400,
          body: { error: 'Motif requis' },
        };
      },
    },
  });

  assert.equal(response.status, 400);
  assert.deepEqual(response.body, {
    error: 'Motif requis',
  });
});

test('conversation message routes transmet la suppression et respecte auth', async () => {
  const calls = [];
  const deleted = await requestMessages({
    method: 'DELETE',
    path: '/conversations/conv-1/messages/m-1',
    auth: authenticated,
    messages: {
      deleteMessage(...args) {
        calls.push(args);
        return {
          status: 200,
          body: { ok: true },
        };
      },
    },
  });
  assert.deepEqual(deleted.body, { ok: true });
  assert.deepEqual(calls, [['conv-1', 'm-1', 'u-1']]);

  let serviceCalls = 0;
  const refused = await requestMessages({
    auth(_req, res) {
      res.status(401).json({ error: 'Non authentifie' });
    },
    messages: {
      createConversation() {
        serviceCalls += 1;
      },
    },
  });
  assert.equal(refused.status, 401);
  assert.equal(serviceCalls, 0);
});
