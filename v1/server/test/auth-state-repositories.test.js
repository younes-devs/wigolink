import assert from 'node:assert/strict';
import test from 'node:test';
import { createRepositories } from '../repositories.js';

function authRepositories(db = {}) {
  const repositories = createRepositories({
    db,
    save() {},
    newId(prefix) {
      return `${prefix}-1`;
    },
    findUser() {
      return null;
    },
    publicUser() {
      return null;
    },
  });
  return {
    resets: repositories.authResets,
    users: repositories.users,
    verifications: repositories.authVerifications,
  };
}

test('user repository ajoute et recherche un email normalise', () => {
  const db = {};
  const { users } = authRepositories(db);
  const user = { id: 'u-1', email: 'membre@example.test' };

  assert.equal(users.findByEmail('membre@example.test'), null);
  assert.equal(users.append(user), user);
  assert.equal(users.findByEmail('  MEMBRE@example.test '), user);
  assert.deepEqual(db.users, [user]);
});

test('auth verification repository initialise, remplace et retire un code', () => {
  const db = {};
  const { verifications } = authRepositories(db);
  const first = { code: '123456', expires: 1000, rememberMe: true };
  const second = { code: '654321', expires: 2000, rememberMe: false };

  assert.equal(verifications.get('membre@example.test'), null);
  assert.equal(verifications.set('membre@example.test', first), first);
  assert.equal(verifications.get('membre@example.test'), first);
  verifications.set('membre@example.test', second);
  assert.equal(verifications.get('membre@example.test'), second);
  verifications.remove('membre@example.test');
  assert.equal(verifications.get('membre@example.test'), null);
  assert.deepEqual(db.pendingVerifications, {});
});

test('auth reset repository initialise, remplace et retire un code', () => {
  const db = {};
  const { resets } = authRepositories(db);
  const first = { code: '123456', expires: 1000 };
  const second = { code: '654321', expires: 2000 };

  assert.equal(resets.get('membre@example.test'), null);
  assert.equal(resets.set('membre@example.test', first), first);
  assert.equal(resets.get('membre@example.test'), first);
  resets.set('membre@example.test', second);
  assert.equal(resets.get('membre@example.test'), second);
  resets.remove('membre@example.test');
  assert.equal(resets.get('membre@example.test'), null);
  assert.deepEqual(db.resets, {});
});
