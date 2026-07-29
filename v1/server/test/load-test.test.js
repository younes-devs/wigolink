import assert from 'node:assert/strict';
import test from 'node:test';
import { runLoadScenario } from '../../scripts/load-test.mjs';

test('load test borne la concurrence et resume statuts, erreurs et latence', async () => {
  let active = 0;
  let maxActive = 0;
  let calls = 0;
  const result = await runLoadScenario({
    baseUrl: 'https://example.test',
    path: '/api/health',
    requests: 8,
    concurrency: 3,
    async fetchImpl() {
      calls += 1;
      const call = calls;
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active -= 1;
      const status = call === 8 ? 503 : 200;
      return {
        ok: status === 200,
        status,
        arrayBuffer: async () => new ArrayBuffer(0),
      };
    },
  });

  assert.equal(result.requests, 8);
  assert.equal(maxActive, 3);
  assert.equal(result.failures, 1);
  assert.deepEqual(result.statuses, { 200: 7, 503: 1 });
});

test('load test accepte POST, corps JSON et statuts fonctionnels attendus', async () => {
  const calls = [];
  const result = await runLoadScenario({
    baseUrl: 'https://example.test',
    path: '/api/auth/login',
    requests: 2,
    concurrency: 1,
    method: 'POST',
    body: '{"email":"member@example.test","password":"wrong"}',
    acceptedStatuses: [401],
    async fetchImpl(url, options) {
      calls.push({ url, options });
      return {
        ok: false,
        status: 401,
        arrayBuffer: async () => new ArrayBuffer(0),
      };
    },
  });

  assert.equal(result.failures, 0);
  assert.deepEqual(result.statuses, { 401: 2 });
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.headers['Content-Type'], 'application/json');
  assert.match(calls[0].options.body, /member@example\.test/);
});
