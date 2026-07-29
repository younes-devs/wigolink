import assert from 'node:assert/strict';
import test from 'node:test';
import { relationalAuditLogs } from '../relational-audit-logs.js';

test('audit relationnel joint les acteurs sans charger tous les membres', async () => {
  const calls = [];
  const at = new Date('2026-07-29T10:00:00.000Z');
  const logs = await relationalAuditLogs({
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
  assert.deepEqual(calls[0].params, [200]);
  assert.equal(logs[0].at, at.getTime());
  assert.equal(logs[0].actor.name, 'Admin');
  assert.equal(logs[0].actor.email, undefined);
  assert.equal(logs[0].actor.isAdmin, true);
});
