import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createRelationalAccountDeletion,
  relationalAccountMessages,
} from '../relational-account-privacy.js';

function createClient({
  confirmation = {
    type: 'delete_account',
    code: '123456',
    expires: 20_000,
  },
  activeOperations = 0,
  user = {
    id: 'u-1',
    name: 'Membre',
    email: 'member@example.test',
    phone: '+32000000000',
    city: 'Bruxelles',
    photoUrl: 'profile/photo.jpg',
    passwordHash: 'secret',
    provider: 'email',
  },
} = {}) {
  const calls = [];
  const client = {
    async query(sql, params = []) {
      const normalized = String(sql).replace(/\s+/g, ' ').trim();
      calls.push({ sql: normalized, params });
      if (normalized.includes('from public.wigolink_runtime_records')) {
        return { rows: confirmation ? [{ data: confirmation }] : [] };
      }
      if (normalized.includes('from public.wigolink_transactions')) {
        return { rows: [{ count: activeOperations }] };
      }
      if (normalized.includes('from public.wigolink_users')) {
        return { rows: user ? [{ data: user }] : [] };
      }
      return { rows: [], rowCount: 1 };
    },
    release() {
      calls.push({ sql: 'release', params: [] });
    },
  };
  return { client, calls };
}

function deletionFor(client) {
  return createRelationalAccountDeletion({
    getPool: () => ({
      async connect() {
        return client;
      },
    }),
  });
}

test('confidentialite relationnelle exporte le payload complet des messages', async () => {
  const calls = [];
  const messages = await relationalAccountMessages({
    userId: 'u-1',
    pool: {
      async query(sql, params) {
        calls.push({ sql, params });
        return {
          rows: [
            { message: { id: 'm-2', from: 'u-1', attachments: [{ id: 'a-1' }] } },
            { message: { id: 'm-1', from: 'u-1', text: 'Bonjour' } },
          ],
        };
      },
    },
  });

  assert.deepEqual(calls[0].params, ['u-1']);
  assert.match(calls[0].sql, /where from_id = \$1/);
  assert.deepEqual(messages, [
    { id: 'm-2', from: 'u-1', attachments: [{ id: 'a-1' }] },
    { id: 'm-1', from: 'u-1', text: 'Bonjour' },
  ]);
});

test('suppression relationnelle anonymise et journalise dans une transaction', async () => {
  const { client, calls } = createClient();
  const result = await deletionFor(client)({
    userId: 'u-1',
    code: '123456',
    now: 10_000,
  });

  assert.equal(result.account.name, 'Compte supprimé');
  assert.equal(result.account.email, 'deleted-u-1@wigolink.invalid');
  assert.equal(result.account.passwordHash, null);
  assert.equal(result.account.googleSubject, null);
  assert.equal(result.account.googleLinkedAt, null);
  assert.equal(result.account.deletedAt, 10_000);
  assert.equal(calls[0].sql, 'begin');
  assert.equal(calls.at(-2).sql, 'commit');
  assert.equal(calls.at(-1).sql, 'release');
  assert.ok(calls.some(({ sql }) => (
    sql.startsWith('update public.wigolink_users')
  )));
  assert.ok(calls.some(({ sql }) => (
    sql.startsWith('delete from public.wigolink_sessions')
  )));
  assert.ok(calls.some(({ sql }) => (
    sql.startsWith('insert into public.audit_logs')
  )));
  assert.equal(calls.some(({ sql }) => (
    /delete from public\.(messages|wigolink_kyc|audit_logs)/.test(sql)
  )), false);
});

test('suppression relationnelle rollback si le code est faux', async () => {
  const { client, calls } = createClient();
  const result = await deletionFor(client)({
    userId: 'u-1',
    code: '000000',
    now: 10_000,
  });

  assert.deepEqual(result, {
    status: 400,
    error: 'Code de confirmation incorrect',
  });
  assert.deepEqual(calls.map(({ sql }) => sql), [
    'begin',
    'select data from public.wigolink_runtime_records where kind = $1 and id = $2 for update',
    'rollback',
    'release',
  ]);
});

test('suppression relationnelle rollback si une operation reste active', async () => {
  const { client, calls } = createClient({ activeOperations: 2 });
  const result = await deletionFor(client)({
    userId: 'u-1',
    code: '123456',
    now: 10_000,
  });

  assert.equal(result.status, 400);
  assert.match(result.error, /2 transaction/);
  assert.equal(calls.some(({ sql }) => (
    sql.startsWith('update public.wigolink_users')
  )), false);
  assert.equal(calls.at(-2).sql, 'rollback');
});
