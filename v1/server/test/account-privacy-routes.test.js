import assert from 'node:assert/strict';
import express from 'express';
import test from 'node:test';
import { createAccountPrivacyRouter } from '../routes/account-privacy.js';

async function requestPrivacy({
  method = 'GET',
  path = '/export',
  body,
  user = { id: 'u-1' },
  auth,
  accountPrivacy,
}) {
  const app = express();
  app.use(express.json());
  app.use('/api/profile', createAccountPrivacyRouter({
    auth: auth || ((req, _res, next) => {
      req.user = user;
      next();
    }),
    accountPrivacy,
  }));
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });

  try {
    const address = server.address();
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/profile${path}`,
      {
        method,
        headers: body === undefined
          ? undefined
          : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      },
    );
    return {
      status: response.status,
      body: await response.json(),
      disposition: response.headers.get('content-disposition'),
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

test('account privacy routes servent l export avec son nom de fichier historique', async () => {
  const user = { id: 'u-1' };
  const exported = { exportedAt: '2026-07-25T00:00:00.000Z', user };
  const response = await requestPrivacy({
    user,
    accountPrivacy: {
      async exportData(candidate) {
        assert.equal(candidate, user);
        return exported;
      },
    },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, exported);
  assert.equal(
    response.disposition,
    'attachment; filename="wigofly-donnees-u-1.json"',
  );
});

test('account privacy routes deleguent demande et confirmation de suppression', async () => {
  const user = { id: 'u-1' };
  const calls = [];
  const accountPrivacy = {
    async requestDeletion(input) {
      calls.push(['request', input]);
      return { value: { ok: true, demoHint: 'code-demo' } };
    },
    async deleteAccount(input) {
      calls.push(['delete', input]);
      return { value: { ok: true } };
    },
  };
  const requested = await requestPrivacy({
    method: 'POST',
    path: '/delete/request',
    user,
    accountPrivacy,
  });
  const deleted = await requestPrivacy({
    method: 'POST',
    path: '/delete',
    body: { code: '123456' },
    user,
    accountPrivacy,
  });

  assert.equal(requested.status, 200);
  assert.deepEqual(requested.body, { ok: true, demoHint: 'code-demo' });
  assert.equal(deleted.status, 200);
  assert.deepEqual(deleted.body, { ok: true });
  assert.deepEqual(calls, [
    ['request', { user, lang: undefined }],
    ['delete', { user, body: { code: '123456' } }],
  ]);
});

test('account privacy routes ne consultent pas le service si auth refuse', async () => {
  const response = await requestPrivacy({
    auth(_req, res) {
      res.status(401).json({ error: 'Non authentifie' });
    },
    accountPrivacy: {
      exportData() {
        assert.fail('le service ne doit pas etre consulte');
      },
    },
  });

  assert.equal(response.status, 401);
  assert.deepEqual(response.body, { error: 'Non authentifie' });
});
