import test from 'node:test';
import assert from 'node:assert/strict';
import {
  migrateJsonToPostgres,
  migrationPlan,
  parseCollections,
} from '../migrate-json-postgres.js';

const sampleData = {
  auditLogs: [{
    actorId: 'u-admin',
    action: 'kyc.approve',
    targetType: 'kyc_submission',
    targetId: 'kyc-1',
    meta: { ok: true },
    at: Date.parse('2026-07-15T10:00:00.000Z'),
  }],
  notifications: [{
    id: 'n-1',
    userId: 'u-fatima',
    txId: 'tx-1',
    type: 'messages',
    section: 'matching',
    key: 'offer.received',
    params: { title: 'Colis' },
    text: 'fallback',
    read: false,
    at: Date.parse('2026-07-15T11:00:00.000Z'),
  }],
  messages: [{
    id: 'm-1',
    txId: 'tx-1',
    from: 'u-karim',
    text: 'Bonjour',
    flagged: true,
    at: Date.parse('2026-07-15T12:00:00.000Z'),
  }],
};

test('migration json postgres : plan compte les collections supportees', () => {
  assert.deepEqual(migrationPlan(sampleData), {
    auditLogs: 1,
    notifications: 1,
    messages: 1,
  });
});

test('migration json postgres : dry-run ne requiert pas de pool', async () => {
  const result = await migrateJsonToPostgres({
    data: sampleData,
    collections: ['notifications', 'messages'],
    dryRun: true,
  });

  assert.equal(result.dryRun, true);
  assert.deepEqual(result.planned, { notifications: 1, messages: 1 });
  assert.deepEqual(result.inserted, { notifications: 0, messages: 0 });
});

test('migration json postgres : refuse une collection non supportee', () => {
  assert.throws(
    () => parseCollections('messages,transactions'),
    /Collections non migrables: transactions/
  );
});

test('migration json postgres : messages et notifications sont idempotents par id', async () => {
  const calls = [];
  const pool = {
    async query(sql, params) {
      calls.push({ sql, params });
      return { rowCount: /notifications/.test(sql) ? 0 : 1, rows: [] };
    },
  };

  const result = await migrateJsonToPostgres({
    data: sampleData,
    pool,
    collections: ['notifications', 'messages'],
    dryRun: false,
  });

  assert.match(calls[0].sql, /insert into notifications/);
  assert.match(calls[0].sql, /on conflict \(id\) do nothing/);
  assert.equal(calls[0].params[0], 'n-1');
  assert.equal(calls[0].params[6], '{"title":"Colis"}');
  assert.match(calls[1].sql, /insert into messages/);
  assert.match(calls[1].sql, /on conflict \(id\) do nothing/);
  assert.deepEqual(result.inserted, { notifications: 0, messages: 1 });
  assert.deepEqual(result.skipped, { notifications: 1, messages: 0 });
});

test('migration json postgres : auditLogs evite les doublons naturels', async () => {
  const calls = [];
  const pool = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (/select 1/.test(sql)) return { rows: [] };
      return { rowCount: 1, rows: [] };
    },
  };

  const result = await migrateJsonToPostgres({
    data: sampleData,
    pool,
    collections: ['auditLogs'],
    dryRun: false,
  });

  assert.match(calls[0].sql, /from audit_logs/);
  assert.match(calls[0].sql, /is not distinct from/);
  assert.deepEqual(calls[0].params, [
    'u-admin',
    'kyc.approve',
    'kyc_submission',
    'kyc-1',
    Date.parse('2026-07-15T10:00:00.000Z'),
  ]);
  assert.match(calls[1].sql, /insert into audit_logs/);
  assert.equal(calls[1].params[4], '{"ok":true}');
  assert.deepEqual(result.inserted, { auditLogs: 1 });
});
