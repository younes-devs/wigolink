import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import {
  createRelationalAuthRepositories,
  relationalAuthEnabled,
} from '../relational-auth-repositories.js';

function poolWith(handler) {
  return {
    query(sql, params) {
      return handler(sql, params);
    },
  };
}

test('auth relationnelle : option inactive par defaut', () => {
  assert.equal(relationalAuthEnabled({}), false);
  assert.equal(relationalAuthEnabled({ RELATIONAL_AUTH: 'true' }), true);
});

test('auth relationnelle : recherche un utilisateur sans charger l etat global', async () => {
  const calls = [];
  const user = { id: 'u-1', email: 'member@example.test' };
  const repositories = createRelationalAuthRepositories({
    getPool: () => poolWith((sql, params) => {
      calls.push({ sql, params });
      return { rows: [{ data: user }] };
    }),
  });

  assert.equal(await repositories.users.findByEmail(' MEMBER@example.test '), user);
  assert.match(calls[0].sql, /wigofly_users/);
  assert.deepEqual(calls[0].params, ['member@example.test']);
});

test('auth relationnelle : insere et met a jour une seule ligne utilisateur', async () => {
  const calls = [];
  const user = { id: 'u-1', email: 'member@example.test', createdAt: 1_000 };
  const repositories = createRelationalAuthRepositories({
    getPool: () => poolWith((sql, params) => {
      calls.push({ sql, params });
      return { rowCount: 1, rows: [{ data: user }] };
    }),
  });

  await repositories.users.append(user);
  await repositories.users.update({ ...user, emailVerified: true });

  assert.match(calls[0].sql, /insert into public\.wigofly_users/);
  assert.match(calls[1].sql, /update public\.wigofly_users/);
  assert.equal(calls[0].params[0], user.id);
  assert.equal(JSON.parse(calls[1].params[1]).emailVerified, true);
});

test('auth relationnelle : fusionne seulement les champs utilisateur modifies', async () => {
  const calls = [];
  const before = {
    id: 'u-1',
    name: 'Avant',
    settings: { notifications: { messages: true } },
  };
  const after = {
    ...before,
    name: 'Apres',
  };
  const repositories = createRelationalAuthRepositories({
    getPool: () => poolWith((sql, params) => {
      calls.push({ sql, params });
      return { rowCount: 1, rows: [{ data: after }] };
    }),
  });

  await repositories.users.updateChanged(after, before);

  assert.match(calls[0].sql, /data = data \|\|/);
  assert.deepEqual(JSON.parse(calls[0].params[1]), { name: 'Apres' });
});

test('auth relationnelle : masque l email dans la cle des codes temporaires', async () => {
  const calls = [];
  const email = 'member@example.test';
  const expectedId = crypto.createHash('sha256').update(email).digest('hex');
  const repositories = createRelationalAuthRepositories({
    getPool: () => poolWith((sql, params) => {
      calls.push({ sql, params });
      return { rows: [], rowCount: 1 };
    }),
  });

  await repositories.verifications.set(email, {
    code: '123456',
    expires: 20_000,
  });

  assert.match(calls[0].sql, /wigofly_runtime_records/);
  assert.equal(calls[0].params[0], 'email_verification');
  assert.equal(calls[0].params[1], expectedId);
  assert.ok(calls[0].params[3] instanceof Date);
  assert.doesNotMatch(calls[0].params[1], /member/);
});

test('auth relationnelle : lit aussi les anciennes cles avant de les migrer', async () => {
  const calls = [];
  const value = { code: '654321', expires: 20_000 };
  const repositories = createRelationalAuthRepositories({
    getPool: () => poolWith((sql, params) => {
      calls.push({ sql, params });
      return { rows: [{ data: value }] };
    }),
  });

  assert.deepEqual(await repositories.resets.get('member@example.test'), value);
  assert.equal(calls[0].params[0], 'password_reset');
  assert.equal(calls[0].params[1][1], 'member@example.test');
});
