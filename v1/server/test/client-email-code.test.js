import test from 'node:test';
import assert from 'node:assert/strict';
import { insertEmailCode, normalizeEmailCode } from '../../client/src/shared/ui/emailCode.js';

test('email code normalization keeps only six digits', () => {
  assert.equal(normalizeEmailCode(' 12a3-4567 '), '123456');
});

test('email code insertion supports sequential entry, replacement and paste', () => {
  assert.equal(insertEmailCode('', 0, '1'), '1');
  assert.equal(insertEmailCode('1', 1, '2'), '12');
  assert.equal(insertEmailCode('123456', 2, '9'), '129456');
  assert.equal(insertEmailCode('', 0, '12 34-56'), '123456');
});
