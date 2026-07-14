import test from 'node:test';
import assert from 'node:assert/strict';
import { createPostgresAuditLogRepository } from '../postgres-repositories.js';

test('postgres auditLogs : append mappe vers audit_logs', async () => {
  const calls = [];
  const pool = {
    async query(sql, params) {
      calls.push({ sql, params });
      return {
        rows: [{
          id: 7,
          actor_id: 'u-admin',
          action: 'kyc.approve',
          target_type: 'kyc_submission',
          target_id: 'kyc-1',
          meta: { ok: true },
          at: new Date('2026-07-15T10:00:00.000Z'),
        }],
      };
    },
  };
  const repo = createPostgresAuditLogRepository({
    pool,
    findUser: (id) => ({ id, name: 'Admin' }),
    publicUser: (u) => ({ id: u.id, name: u.name }),
  });

  const log = await repo.append({
    actorId: 'u-admin',
    action: 'kyc.approve',
    targetType: 'kyc_submission',
    targetId: 'kyc-1',
    meta: { ok: true },
  });

  assert.match(calls[0].sql, /insert into audit_logs/);
  assert.deepEqual(calls[0].params, ['u-admin', 'kyc.approve', 'kyc_submission', 'kyc-1', '{"ok":true}']);
  assert.equal(log.id, '7');
  assert.equal(log.actorId, 'u-admin');
  assert.equal(log.actor.name, 'Admin');
  assert.equal(log.at, Date.parse('2026-07-15T10:00:00.000Z'));
});

test('postgres auditLogs : list borne la limite et renvoie acteur public', async () => {
  const calls = [];
  const pool = {
    async query(sql, params) {
      calls.push({ sql, params });
      return {
        rows: [{
          id: 8,
          actor_id: 'u-missing',
          action: 'custom_whitelist.remove',
          target_type: 'custom_whitelist',
          target_id: 'argan',
          meta: {},
          at: '2026-07-15T11:00:00.000Z',
        }],
      };
    },
  };
  const repo = createPostgresAuditLogRepository({
    pool,
    findUser: () => null,
    publicUser: () => null,
  });

  const logs = await repo.list({ limit: 999 });

  assert.match(calls[0].sql, /from audit_logs/);
  assert.equal(calls[0].params[0], 200);
  assert.equal(logs[0].id, '8');
  assert.deepEqual(logs[0].actor, { id: 'u-missing', name: 'system' });
});
