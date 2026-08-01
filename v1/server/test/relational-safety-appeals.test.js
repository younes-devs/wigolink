import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createRelationalSafetyAppeals,
  relationalSafetyAppealsEnabled,
} from '../relational-safety-appeals.js';

function createPool(handler) {
  const calls = [];
  const client = {
    async query(sql, params = []) {
      calls.push({ sql: String(sql), params });
      return handler(String(sql), params);
    },
    release() {},
  };
  return {
    calls,
    pool: {
      connect: async () => client,
      query: client.query,
    },
  };
}

test('recours relationnels restent inactifs sans drapeau', () => {
  assert.equal(relationalSafetyAppealsEnabled({}), false);
  assert.equal(relationalSafetyAppealsEnabled({
    RELATIONAL_SAFETY_APPEALS: 'true',
  }), true);
});

test('soumission de recours et audit partagent une transaction', async () => {
  const harness = createPool((sql) => {
    if (/select data/.test(sql)) return { rows: [] };
    return { rowCount: 1, rows: [] };
  });
  const repository = createRelationalSafetyAppeals({
    getPool: () => harness.pool,
  });

  const result = await repository.submit({
    id: 'appeal-1',
    userId: 'u-1',
    reason: 'Une raison suffisamment detaillee',
    at: 1000,
  });

  assert.equal(result.kind, 'ok');
  assert.equal(result.appeal.status, 'open');
  assert.ok(harness.calls.some(({ sql }) => (
    /insert into public\.wigolink_review_queue/.test(sql)
  )));
  assert.ok(harness.calls.some(({ sql }) => (
    /insert into public\.audit_logs/.test(sql)
  )));
  assert.ok(harness.calls.some(({ sql }) => sql === 'commit'));
});

test('un recours ouvert existant est dedoublonne', async () => {
  const existing = {
    id: 'appeal-1',
    type: 'safety_appeal',
    userId: 'u-1',
    status: 'open',
  };
  const harness = createPool((sql) => (
    /select data/.test(sql)
      ? { rows: [{ data: existing }] }
      : { rowCount: 1, rows: [] }
  ));
  const repository = createRelationalSafetyAppeals({
    getPool: () => harness.pool,
  });

  const result = await repository.submit({
    id: 'appeal-2',
    userId: 'u-1',
    reason: 'Une autre raison suffisamment detaillee',
    at: 2000,
  });

  assert.equal(result.kind, 'duplicate');
  assert.equal(
    harness.calls.some(({ sql }) => /insert into public\.wigolink_review_queue/.test(sql)),
    false,
  );
});

test('acceptation ferme le recours et leve la suspension atomiquement', async () => {
  const appeal = {
    id: 'appeal-1',
    type: 'safety_appeal',
    userId: 'u-1',
    status: 'open',
  };
  const user = {
    id: 'u-1',
    suspendedUntil: 9999,
    suspensionReason: 'raison',
    messageSafetyBlockedUntil: 9999,
  };
  const harness = createPool((sql) => {
    if (/wigolink_review_queue[\s\S]+for update/.test(sql)) {
      return { rows: [{ data: structuredClone(appeal) }] };
    }
    if (/wigolink_users[\s\S]+for update/.test(sql)) {
      return { rows: [{ data: structuredClone(user) }] };
    }
    return { rowCount: 1, rows: [] };
  });
  const repository = createRelationalSafetyAppeals({
    getPool: () => harness.pool,
  });

  const result = await repository.review({
    actorId: 'admin',
    appealId: 'appeal-1',
    decision: 'approve',
    reason: 'Recours accepte',
    at: 3000,
  });

  assert.equal(result.kind, 'ok');
  assert.equal(result.appeal.status, 'accepted');
  const userUpdate = harness.calls.find(({ sql, params }) => (
    /update public\.wigolink_users/.test(sql) && params.length > 1
  ));
  assert.equal(JSON.parse(userUpdate.params[1]).suspendedUntil, null);
});

test('etat securite charge des pages bornees sans document global', async () => {
  let call = 0;
  const harness = createPool(() => {
    call += 1;
    return call === 1
      ? { rows: [{ data: { id: 'u-1', isAdmin: false } }] }
      : {
          rows: [{
            appeal: { id: 'appeal-1', userId: 'u-1' },
            member: { id: 'u-1' },
          }],
        };
  });
  const repository = createRelationalSafetyAppeals({
    getPool: () => harness.pool,
  });

  const result = await repository.safetyState({
    currentTime: 5000,
    attemptCutoff: 1000,
  });

  assert.equal(result.users[0].id, 'u-1');
  assert.equal(result.appeals[0].user.id, 'u-1');
  assert.ok(harness.calls.every(({ sql }) => /limit (200|500)/.test(sql)));
});
