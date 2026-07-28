import assert from 'node:assert/strict';
import test from 'node:test';
import { createDistributedRateLimit } from '../auth.js';

test('rate limit distribue anonymise la cle et respecte le compteur atomique', async () => {
  const calls = [];
  const pool = {
    async query(text, params) {
      calls.push({ text, params });
      return { rows: [{ count: 11 }] };
    },
  };
  const limited = await createDistributedRateLimit({ pool })('login:person@example.com');

  assert.equal(limited, true);
  assert.equal(calls.length, 1);
  assert.match(calls[0].text, /on conflict \(kind, id\) do update/i);
  assert.equal(calls[0].params[0].length, 64);
  assert.equal(calls[0].params[0].includes('person@example.com'), false);
});

test('rate limit distribue revient au limiteur local si Postgres echoue', async () => {
  const errors = [];
  const limiter = createDistributedRateLimit({
    pool: {
      async query() {
        throw new Error('database unavailable');
      },
    },
    fallback(key) {
      return key === 'login:test';
    },
    logger: {
      error(event) {
        errors.push(event);
      },
    },
  });

  assert.equal(await limiter('login:test'), true);
  assert.deepEqual(errors, ['distributed_rate_limit_failed']);
});
