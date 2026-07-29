import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createRelationalAdminMemberMutations,
  relationalAdminActionsEnabled,
} from '../relational-admin-actions.js';

function createPool({
  user = null,
  activeAdmins = 2,
  whitelist = null,
} = {}) {
  const calls = [];
  const client = {
    async query(sql, params = []) {
      calls.push({ sql: String(sql), params });
      if (/select data[\s\S]+for update/.test(sql)) {
        return { rows: user ? [{ data: structuredClone(user) }] : [] };
      }
      if (/select count\(\*\)/.test(sql)) {
        return { rows: [{ count: activeAdmins }] };
      }
      if (/update public\.wigofly_users/.test(sql)) {
        return { rowCount: 1 };
      }
      if (/delete from public\.wigofly_custom_whitelist/.test(sql)) {
        return whitelist
          ? { rowCount: 1, rows: [{ data: whitelist }] }
          : { rowCount: 0, rows: [] };
      }
      return { rowCount: 1, rows: [] };
    },
    release() {
      calls.push({ sql: 'release', params: [] });
    },
  };
  return {
    calls,
    pool: {
      connect: async () => client,
      async query(sql, params = []) {
        calls.push({ sql: String(sql), params });
        return { rowCount: user ? 1 : 0, rows: [] };
      },
    },
  };
}

test('drapeau des actions admin relationnelles est explicite', () => {
  assert.equal(relationalAdminActionsEnabled({}), false);
  assert.equal(
    relationalAdminActionsEnabled({ RELATIONAL_ADMIN_ACTIONS: 'true' }),
    true,
  );
});

test('acces dossier est journalise uniquement si le membre existe', async () => {
  const found = createPool({ user: { id: 'u-1' } });
  const missing = createPool();
  const foundRepo = createRelationalAdminMemberMutations({
    getPool: () => found.pool,
  });
  const missingRepo = createRelationalAdminMemberMutations({
    getPool: () => missing.pool,
  });

  assert.equal(await foundRepo.recordCaseAccess({
    actorId: 'admin',
    userId: 'u-1',
    section: 'messages',
  }), true);
  assert.equal(await missingRepo.recordCaseAccess({
    actorId: 'admin',
    userId: 'missing',
    section: 'overview',
  }), false);
  assert.match(found.calls[0].sql, /insert into public\.audit_logs/);
});

test('promotion et audit partagent la meme transaction', async () => {
  const harness = createPool({
    user: { id: 'member', email: 'member@example.test', isAdmin: false },
  });
  const repository = createRelationalAdminMemberMutations({
    getPool: () => harness.pool,
  });

  const result = await repository.changeRole({
    actorId: 'admin',
    userId: 'member',
    becomesAdmin: true,
    at: 1234,
  });

  assert.equal(result.kind, 'ok');
  assert.equal(result.user.isAdmin, true);
  assert.ok(harness.calls.some(({ sql }) => /advisory_xact_lock/.test(sql)));
  assert.ok(harness.calls.some(({ sql }) => /update public\.wigofly_users/.test(sql)));
  assert.ok(harness.calls.some(({ sql }) => /insert into public\.audit_logs/.test(sql)));
  assert.ok(harness.calls.some(({ sql }) => sql === 'commit'));
});

test('le dernier administrateur ne peut pas etre retire', async () => {
  const harness = createPool({
    user: { id: 'admin-2', isAdmin: true },
    activeAdmins: 1,
  });
  const repository = createRelationalAdminMemberMutations({
    getPool: () => harness.pool,
  });

  const result = await repository.changeRole({
    actorId: 'admin-1',
    userId: 'admin-2',
    becomesAdmin: false,
    at: 1234,
  });

  assert.equal(result.kind, 'last_admin');
  assert.equal(
    harness.calls.some(({ sql }) => /update public\.wigofly_users/.test(sql)),
    false,
  );
});

test('suspension met a jour le membre et son audit atomiquement', async () => {
  const harness = createPool({
    user: { id: 'member', isAdmin: false },
  });
  const repository = createRelationalAdminMemberMutations({
    getPool: () => harness.pool,
  });

  const result = await repository.moderateUser({
    actorId: 'admin',
    userId: 'member',
    action: 'suspend',
    reason: 'Risque confirme',
    durationHours: 2,
    at: 1000,
  });

  assert.equal(result.kind, 'ok');
  assert.equal(result.user.suspendedUntil, 1000 + 2 * 3600e3);
  assert.equal(result.user.suspendedBy, 'admin');
  assert.ok(harness.calls.some(({ sql }) => /user\.safety\.\$\{action\}/.test(sql)) === false);
  assert.ok(harness.calls.some(({ params }) => params.includes('user.safety.suspend')));
});

test('retrait whitelist et audit partagent la meme transaction', async () => {
  const harness = createPool({
    whitelist: { id: 'documents', label: 'Documents' },
  });
  const repository = createRelationalAdminMemberMutations({
    getPool: () => harness.pool,
  });

  const removed = await repository.removeWhitelist({
    actorId: 'admin',
    categoryId: 'documents',
  });

  assert.equal(removed.id, 'documents');
  assert.ok(harness.calls.some(({ sql }) => (
    /delete from public\.wigofly_custom_whitelist/.test(sql)
  )));
  assert.ok(harness.calls.some(({ sql }) => (
    /insert into public\.audit_logs/.test(sql)
  )));
  assert.ok(harness.calls.some(({ sql }) => sql === 'commit'));
});
