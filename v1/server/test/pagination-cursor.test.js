import assert from 'node:assert/strict';
import test from 'node:test';
import { decodePageCursor, encodePageCursor } from '../pagination-cursor.js';

test('curseur de pagination reste opaque, valide et borne', () => {
  const value = { at: 123, id: 'row-1' };
  const encoded = encodePageCursor(value);
  assert.doesNotMatch(encoded, /[{}]/);
  assert.deepEqual(
    decodePageCursor(encoded, (cursor) => cursor.at > 0 && !!cursor.id),
    value,
  );
  assert.equal(decodePageCursor('invalide', () => true), null);
  assert.equal(decodePageCursor('a'.repeat(513), () => true), null);
});
