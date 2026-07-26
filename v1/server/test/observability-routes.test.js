import assert from 'node:assert/strict';
import express from 'express';
import test from 'node:test';
import { createObservabilityRouter } from '../routes/observability.js';

test('observability admin expose uniquement le resume apres les gardes', async () => {
  const app = express();
  app.use('/api', createObservabilityRouter({
    auth: (req, _res, next) => { req.user = { id: 'u-admin', isAdmin: true }; next(); },
    adminOnly: (_req, _res, next) => next(),
    snapshot: () => ({ sampleSize: 3, failures: 0 }),
  }));
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/admin/observability`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), {
      observability: { sampleSize: 3, failures: 0 },
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
