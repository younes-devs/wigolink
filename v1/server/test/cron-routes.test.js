import assert from 'node:assert/strict';
import express from 'express';
import test from 'node:test';
import { createCronRouter } from '../routes/cron.js';

async function requestCron({ authorization, retention }) {
  const app = express();
  app.use('/api', createCronRouter({
    secret: 'cron-secret',
    retention,
    logger: { error() {} },
  }));
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  try {
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/api/cron/maintenance`,
      {
        headers: authorization ? { Authorization: authorization } : {},
      },
    );
    return { status: response.status, body: await response.json() };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('cron maintenance refuse un bearer absent ou incorrect', async () => {
  let calls = 0;
  const retention = { async run() { calls += 1; } };

  assert.equal((await requestCron({ retention })).status, 401);
  assert.equal((await requestCron({
    authorization: 'Bearer wrong',
    retention,
  })).status, 401);
  assert.equal(calls, 0);
});

test('cron maintenance execute la retention avec le secret exact', async () => {
  const retentionResult = {
    expiredUploads: 2,
    expiredSessions: 3,
  };
  const response = await requestCron({
    authorization: 'Bearer cron-secret',
    retention: { async run() { return retentionResult; } },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    ok: true,
    retention: retentionResult,
  });
});

test('cron maintenance transforme une panne en 503', async () => {
  const response = await requestCron({
    authorization: 'Bearer cron-secret',
    retention: {
      async run() {
        throw new Error('database offline');
      },
    },
  });

  assert.equal(response.status, 503);
});
