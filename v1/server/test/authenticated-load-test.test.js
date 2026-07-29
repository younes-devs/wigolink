import assert from 'node:assert/strict';
import test from 'node:test';
import { runAuthenticatedLoadTest } from '../../scripts/authenticated-load-test.mjs';

function testPool() {
  const calls = [];
  return {
    calls,
    async query(sql, params = []) {
      calls.push({ sql: String(sql), params });
      if (String(sql).includes('from public.wigofly_users')) {
        return {
          rows: [{ user_id: 'u-load', conversation_id: 'conv-load' }],
        };
      }
      return { rows: [], rowCount: 1 };
    },
  };
}

test('charge authentifiee cree puis retire toujours sa session temporaire', async () => {
  const pool = testPool();
  const requested = [];
  const report = await runAuthenticatedLoadTest({
    pool,
    baseUrl: 'https://example.test',
    requests: 2,
    concurrency: 1,
    async fetchImpl(url, options) {
      requested.push({ url: String(url), authorization: options.headers.Authorization });
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => new ArrayBuffer(0),
      };
    },
  });

  assert.equal(report.passed, true);
  assert.deepEqual(
    report.results.map((result) => result.name),
    ['navigation', 'trips', 'conversations', 'operations', 'messages'],
  );
  assert.equal(requested.length, 15);
  assert.ok(requested.every(({ authorization }) => (
    /^Bearer [A-Za-z0-9_-]+$/.test(authorization)
  )));
  assert.match(pool.calls[1].sql, /insert into public\.wigofly_sessions/);
  assert.match(pool.calls.at(-1).sql, /delete from public\.wigofly_sessions/);
  assert.equal(pool.calls[1].params[0], pool.calls.at(-1).params[0]);
});

test('charge authentifiee nettoie la session apres une erreur HTTP', async () => {
  const pool = testPool();
  await assert.rejects(
    runAuthenticatedLoadTest({
      pool,
      baseUrl: 'https://example.test',
      requests: 1,
      concurrency: 1,
      async fetchImpl() {
        return {
          ok: false,
          status: 503,
          arrayBuffer: async () => new ArrayBuffer(0),
        };
      },
    }),
    /Prechauffage refuse/,
  );
  assert.match(pool.calls.at(-1).sql, /delete from public\.wigofly_sessions/);
});
