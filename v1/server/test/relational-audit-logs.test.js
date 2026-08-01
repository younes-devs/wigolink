import assert from 'node:assert/strict';
import test from 'node:test';
import { relationalAuditLogs } from '../relational-audit-logs.js';

test('audit relationnel joint les acteurs sans charger tous les membres', async () => {
  const calls = [];
  const at = new Date('2026-07-29T10:00:00.000Z');
  const result = await relationalAuditLogs({
    pool: {
      async query(sql, params) {
        calls.push({ sql, params });
        return {
          rows: [{
            id: 42,
            actor_id: 'u-admin',
            action: 'admin.member_case.view',
            target_type: 'user',
            target_id: 'u-1',
            meta: { section: 'messages' },
            at,
            actor: {
              id: 'u-admin',
              name: 'Admin',
              email: 'secret@example.test',
              isAdmin: true,
              settings: { onboardingDone: true },
            },
          }],
        };
      },
    },
    limit: 1_000,
  });

  assert.match(calls[0].sql, /left join public\.wigofly_users/);
  assert.deepEqual(calls[0].params, [201]);
  assert.equal(result.logs[0].at, at.getTime());
  assert.equal(result.logs[0].actor.name, 'Admin');
  assert.equal(result.logs[0].actor.email, undefined);
  assert.equal(result.logs[0].actor.isAdmin, true);
  assert.equal(result.page.hasMore, false);
});

test('audit relationnel poursuit les evenements avec un curseur stable', async () => {
  const calls = [];
  const rows = [1, 2].map((id) => ({
    id,
    actor_id: 'system',
    action: 'test',
    target_type: 'user',
    target_id: 'u-1',
    meta: {},
    at: new Date(`2026-07-29T10:00:0${2 - id}.000Z`),
    actor: null,
  }));
  const pool = {
    async query(sql, params) {
      calls.push({ sql, params });
      return { rows };
    },
  };

  const first = await relationalAuditLogs({ pool, limit: 1 });
  assert.equal(first.page.hasMore, true);
  assert.ok(first.page.nextCursor);

  calls.length = 0;
  await relationalAuditLogs({ pool, limit: 1, cursor: first.page.nextCursor });
  assert.match(calls[0].sql, /\(log\.at, log\.id\) < \(\$1, \$2::bigint\)/);
  assert.doesNotMatch(calls[0].sql, /offset/i);
  assert.equal(calls[0].params[1], '1');
});
