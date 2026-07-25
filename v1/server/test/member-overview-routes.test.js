import assert from 'node:assert/strict';
import express from 'express';
import test from 'node:test';
import { createMemberOverviewRouter } from '../routes/member-overview.js';

async function requestOverview({
  path,
  auth = authenticated,
  memberOverview,
}) {
  const app = express();
  app.use((req, _res, next) => {
    req.lang = 'nl';
    next();
  });
  app.use('/api', createMemberOverviewRouter({
    auth,
    memberOverview,
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
  req.user = { id: 'u-1' };
  next();
}

test('routes overview transmettent membre et langue', async () => {
  const calls = [];
  const memberOverview = {
    navigation(user) {
      calls.push(['navigation', user]);
      return { messagesUnread: 2 };
    },
    async trust(user) {
      calls.push(['trust', user]);
      return { score: 80 };
    },
    async dashboard(user, lang) {
      calls.push(['dashboard', user, lang]);
      return { unread: 3 };
    },
  };

  const navigation = await requestOverview({
    path: '/navigation-summary',
    memberOverview,
  });
  const trust = await requestOverview({
    path: '/trust-center',
    memberOverview,
  });
  const dashboard = await requestOverview({
    path: '/dashboard',
    memberOverview,
  });

  assert.equal(navigation.body.messagesUnread, 2);
  assert.equal(trust.body.trust.score, 80);
  assert.equal(dashboard.body.unread, 3);
  assert.deepEqual(calls, [
    ['navigation', { id: 'u-1' }],
    ['trust', { id: 'u-1' }],
    ['dashboard', { id: 'u-1' }, 'nl'],
  ]);
});

test('routes overview authentifient avant le service', async () => {
  let calls = 0;
  const response = await requestOverview({
    path: '/dashboard',
    auth(_req, res) {
      res.status(401).json({ error: 'Non authentifié' });
    },
    memberOverview: {
      dashboard() {
        calls += 1;
      },
    },
  });

  assert.equal(response.status, 401);
  assert.equal(calls, 0);
});
