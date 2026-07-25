import assert from 'node:assert/strict';
import test from 'node:test';
import { adminOnly } from '../middleware/admin-only.js';

function mockResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test('adminOnly refuse un membre normal sans appeler le middleware suivant', () => {
  const res = mockResponse();
  let nextCalled = false;

  adminOnly({ user: { isAdmin: false } }, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { error: 'Réservé aux admins' });
});

test('adminOnly autorise un administrateur', () => {
  const res = mockResponse();
  let nextCalled = false;

  adminOnly({ user: { isAdmin: true } }, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body, null);
});
