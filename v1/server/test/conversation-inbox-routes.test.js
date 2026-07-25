import assert from 'node:assert/strict';
import express from 'express';
import test from 'node:test';
import { createConversationInboxRouter } from '../routes/conversation-inbox.js';

async function requestInbox({
  method = 'GET',
  path = '/conversations',
  body,
  auth,
  inbox,
}) {
  const app = express();
  app.use(express.json());
  app.use('/api', createConversationInboxRouter({ auth, inbox }));
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
        body: body === undefined ? undefined : JSON.stringify(body),
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

test('conversation inbox routes transmet membre, filtres et actions', async () => {
  const calls = [];
  const inbox = {
    list(user, query) {
      calls.push(['list', user, query]);
      return { conversations: [] };
    },
    archive(id, userId, archived) {
      calls.push(['archive', id, userId, archived]);
      return { ok: true };
    },
  };

  const list = await requestInbox({
    path: '/conversations?filter=unread',
    auth: authenticated,
    inbox,
  });
  assert.deepEqual(list.body, { conversations: [] });

  const archive = await requestInbox({
    method: 'POST',
    path: '/conversations/conv-1/archive',
    body: { archived: false },
    auth: authenticated,
    inbox,
  });
  assert.deepEqual(archive.body, { ok: true });
  assert.deepEqual(calls, [
    ['list', { id: 'u-1' }, { filter: 'unread' }],
    ['archive', 'conv-1', 'u-1', false],
  ]);
});

test('conversation inbox routes conserve les erreurs de ressources absentes', async () => {
  const missingConversation = await requestInbox({
    path: '/conversations/missing',
    auth: authenticated,
    inbox: {
      detail() {
        return null;
      },
    },
  });
  assert.equal(missingConversation.status, 404);
  assert.deepEqual(missingConversation.body, {
    error: 'Conversation introuvable',
  });

  const missingBlocked = await requestInbox({
    method: 'POST',
    path: '/blocked-users/missing/unblock',
    auth: authenticated,
    inbox: {
      async unblock() {
        return false;
      },
    },
  });
  assert.equal(missingBlocked.status, 404);
  assert.deepEqual(missingBlocked.body, {
    error: 'Compte bloque introuvable',
  });
});

test('conversation inbox routes ne consulte pas le service si auth refuse', async () => {
  let calls = 0;
  const response = await requestInbox({
    auth(_req, res) {
      res.status(401).json({ error: 'Non authentifie' });
    },
    inbox: {
      list() {
        calls += 1;
      },
    },
  });

  assert.equal(response.status, 401);
  assert.equal(calls, 0);
});

test('conversation inbox routes distingue conversation et participant absents au blocage', async () => {
  const notFound = await requestInbox({
    method: 'POST',
    path: '/conversations/missing/block',
    auth: authenticated,
    inbox: {
      async block() {
        return { notFound: true };
      },
    },
  });
  assert.equal(notFound.status, 404);
  assert.deepEqual(notFound.body, {
    error: 'Conversation introuvable',
  });

  const invalid = await requestInbox({
    method: 'POST',
    path: '/conversations/conv-1/block',
    auth: authenticated,
    inbox: {
      async block() {
        return { invalidParticipant: true };
      },
    },
  });
  assert.equal(invalid.status, 400);
  assert.deepEqual(invalid.body, {
    error: 'Participant introuvable',
  });
});
