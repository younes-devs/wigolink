import assert from 'node:assert/strict';
import express from 'express';
import test from 'node:test';
import { createRealtimeRouter } from '../routes/realtime.js';

async function requestRealtime({
  method = 'GET',
  path = '/',
  auth,
  realtime,
}) {
  const app = express();
  app.use('/api/realtime', createRealtimeRouter({ auth, realtime }));
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });

  try {
    const address = server.address();
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/realtime${path}`,
      { method },
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

test('realtime conserve la reponse 410 de l ancien flux SSE', async () => {
  const response = await requestRealtime({
    auth: authenticated,
    realtime: {
      publicConfig() {
        assert.fail('la configuration ne doit pas etre lue');
      },
    },
  });

  assert.equal(response.status, 410);
  assert.deepEqual(response.body, {
    error: 'Le temps reel SSE est remplace par la synchronisation automatique.',
  });
});

test('realtime session indique explicitement une configuration absente', async () => {
  const response = await requestRealtime({
    method: 'POST',
    path: '/session',
    auth: authenticated,
    realtime: {
      publicConfig() {
        return null;
      },
      ensureChannel() {
        assert.fail('aucun canal ne doit etre cree');
      },
    },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { enabled: false });
});

test('realtime session renvoie seulement la cle publique et le canal du membre', async () => {
  let receivedUser;
  const response = await requestRealtime({
    method: 'POST',
    path: '/session',
    auth: authenticated,
    realtime: {
      publicConfig() {
        return {
          url: 'https://project.supabase.co',
          publishableKey: 'public-key',
        };
      },
      ensureChannel(user) {
        receivedUser = user;
        return 'wigolink:member';
      },
    },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(receivedUser, { id: 'u-1' });
  assert.deepEqual(response.body, {
    enabled: true,
    url: 'https://project.supabase.co',
    publishableKey: 'public-key',
    channel: 'wigolink:member',
  });
});

test('realtime ne consulte jamais le service quand auth refuse', async () => {
  let calls = 0;
  const response = await requestRealtime({
    method: 'POST',
    path: '/session',
    auth(_req, res) {
      res.status(401).json({ error: 'Non authentifie' });
    },
    realtime: {
      publicConfig() {
        calls += 1;
      },
      ensureChannel() {
        calls += 1;
      },
    },
  });

  assert.equal(response.status, 401);
  assert.deepEqual(response.body, { error: 'Non authentifie' });
  assert.equal(calls, 0);
});
