import assert from 'node:assert/strict';
import test from 'node:test';
import { createRepositories } from '../repositories.js';

function confirmationRepository(db = {}) {
  return createRepositories({
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
  }).accountConfirmations;
}

test('account confirmation repository initialise, remplace et retire par membre', () => {
  const db = {};
  const repository = confirmationRepository(db);
  const first = {
    type: 'change_email',
    code: '123456',
    expires: 1000,
  };
  const second = {
    type: 'delete_account',
    code: '654321',
    expires: 2000,
  };

  assert.equal(repository.get('u-1'), null);
  assert.equal(repository.set('u-1', first), first);
  assert.equal(repository.get('u-1'), first);
  repository.set('u-1', second);
  assert.equal(repository.get('u-1'), second);
  repository.remove('u-1');
  assert.equal(repository.get('u-1'), null);
  assert.deepEqual(db.accountConfirmations, {});
});
