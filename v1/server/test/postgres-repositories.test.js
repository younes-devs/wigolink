import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createPostgresAuditLogRepository,
  createPostgresMessageRepository,
  createPostgresNotificationRepository,
} from '../postgres-repositories.js';

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

test('postgres notifications : append mappe vers notifications', async () => {
  const calls = [];
  const pool = {
    async query(sql, params) {
      calls.push({ sql, params });
      return {
        rows: [{
          id: params[0],
          user_id: 'u-fatima',
          tx_id: 'tx-1',
          type: 'messages',
          section: 'matching',
          key: 'offer.received',
          params: { title: 'Colis' },
          text: 'fallback',
          read: false,
          at: new Date('2026-07-15T12:00:00.000Z'),
        }],
      };
    },
  };
  const repo = createPostgresNotificationRepository({ pool });

  const notification = await repo.append({
    userId: 'u-fatima',
    txId: 'tx-1',
    type: 'messages',
    section: 'matching',
    key: 'offer.received',
    params: { title: 'Colis' },
    text: 'fallback',
    at: Date.parse('2026-07-15T12:00:00.000Z'),
  });

  assert.match(calls[0].sql, /insert into notifications/);
  assert.equal(calls[0].params[1], 'u-fatima');
  assert.equal(calls[0].params[6], '{"title":"Colis"}');
  assert.equal(notification.userId, 'u-fatima');
  assert.equal(notification.key, 'offer.received');
  assert.equal(notification.at, Date.parse('2026-07-15T12:00:00.000Z'));
});

test('postgres notifications : list, unread et markAllRead utilisent le scope utilisateur', async () => {
  const calls = [];
  const now = Date.parse('2026-07-28T12:00:00.000Z');
  const pool = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (/count/.test(sql)) return { rows: [{ count: 3 }] };
      if (/update notifications/.test(sql)) return { rowCount: 2, rows: [] };
      return {
        rows: [{
          id: 'n-1',
          user_id: 'u-fatima',
          tx_id: null,
          type: 'security',
          section: null,
          key: 'kyc.verified',
          params: {},
          text: 'fallback',
          read: false,
          at: '2026-07-15T13:00:00.000Z',
        }],
      };
    },
  };
  const repo = createPostgresNotificationRepository({ pool, now: () => now });

  const list = await repo.listForUser('u-fatima', { limit: 999 });
  const unread = await repo.unreadCount('u-fatima');
  const changed = await repo.markAllRead('u-fatima');

  assert.match(calls[0].sql, /where user_id = \$1/);
  assert.match(calls[0].sql, /at >= to_timestamp\(\$2/);
  assert.deepEqual(calls[0].params, [
    'u-fatima',
    now - 10 * 24 * 60 * 60 * 1000,
    100,
  ]);
  assert.equal(list[0].id, 'n-1');
  assert.equal(unread, 3);
  assert.equal(changed, 2);
  assert.deepEqual(calls[1].params, [
    'u-fatima',
    now - 10 * 24 * 60 * 60 * 1000,
  ]);
  assert.deepEqual(calls[2].params, [
    'u-fatima',
    now - 10 * 24 * 60 * 60 * 1000,
  ]);
});

test('postgres messages : append et listForTransaction mappent les colonnes SQL', async () => {
  const calls = [];
  const pool = {
    async query(sql, params) {
      calls.push({ sql, params });
      return {
        rows: [{
          id: params?.[0] || 'm-1',
          tx_id: params?.[1] || 'tx-1',
          from_id: params?.[2] || 'u-fatima',
          text: params?.[3] || 'Bonjour',
          flagged: !!params?.[4],
          at: new Date('2026-07-15T14:00:00.000Z'),
        }],
      };
    },
  };
  const repo = createPostgresMessageRepository({ pool });

  const msg = await repo.append({
    txId: 'tx-1',
    from: 'u-fatima',
    text: 'Appelle-moi',
    flagged: true,
    at: Date.parse('2026-07-15T14:00:00.000Z'),
  });
  const list = await repo.listForTransaction('tx-1');

  assert.match(calls[0].sql, /insert into messages/);
  assert.deepEqual(calls[0].params.slice(1), ['tx-1', 'u-fatima', 'Appelle-moi', true, Date.parse('2026-07-15T14:00:00.000Z')]);
  assert.match(calls[1].sql, /where tx_id = \$1/);
  assert.deepEqual(calls[1].params, ['tx-1']);
  assert.equal(msg.from, 'u-fatima');
  assert.equal(msg.txId, 'tx-1');
  assert.equal(msg.flagged, true);
  assert.equal(list[0].at, Date.parse('2026-07-15T14:00:00.000Z'));
});

test('postgres messages : compteurs et listes fraude utilisent les bons filtres', async () => {
  const calls = [];
  const pool = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (/count\(distinct from_id\)/.test(sql)) return { rows: [{ count: 2 }] };
      if (/count\(\*\)/.test(sql)) return { rows: [{ count: 5 }] };
      return {
        rows: [{
          id: 'm-flagged',
          tx_id: 'tx-1',
          from_id: 'u-karim',
          text: '0612345678',
          flagged: true,
          at: '2026-07-15T15:00:00.000Z',
        }],
      };
    },
  };
  const repo = createPostgresMessageRepository({ pool });

  const fromUser = await repo.flaggedFromUser('u-karim');
  const flagged = await repo.flagged();
  const all = await repo.all();
  const flaggedSenders = await repo.flaggedSenderCount();
  const count = await repo.count();

  assert.match(calls[0].sql, /from_id = \$1 and flagged = true/);
  assert.deepEqual(calls[0].params, ['u-karim']);
  assert.match(calls[1].sql, /where flagged = true/);
  assert.match(calls[2].sql, /from messages/);
  assert.equal(fromUser[0].from, 'u-karim');
  assert.equal(flagged[0].flagged, true);
  assert.equal(all[0].txId, 'tx-1');
  assert.equal(flaggedSenders, 2);
  assert.equal(count, 5);
});
