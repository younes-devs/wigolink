import assert from 'node:assert/strict';
import express from 'express';
import test from 'node:test';
import { createMemberOverviewRouter } from '../routes/member-overview.js';

async function requestOverview({ auth = authenticated, memberOverview }) {
  const app = express();
  app.use('/api', createMemberOverviewRouter({ auth, memberOverview }));
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  try {
    const { port } = server.address();
    const response = await fetch(
      `http://127.0.0.1:${port}/api/navigation-summary`,
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

test('navigation summary forwards the authenticated member', async () => {
  const calls = [];
  const response = await requestOverview({
    memberOverview: {
      navigation(user) {
        calls.push(user);
        return { messagesUnread: 2, operationsActionRequired: 1 };
      },
    },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    messagesUnread: 2,
    operationsActionRequired: 1,
  });
  assert.deepEqual(calls, [{ id: 'u-1' }]);
});

test('navigation summary authenticates before calling the service', async () => {
  let calls = 0;
  const response = await requestOverview({
    auth(_req, res) {
      res.status(401).json({ error: 'Non authentifie' });
    },
    memberOverview: {
      navigation() {
        calls += 1;
      },
    },
  });

  assert.equal(response.status, 401);
  assert.equal(calls, 0);
});
