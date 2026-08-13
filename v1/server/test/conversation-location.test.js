import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeMessageLocation } from '../services/conversation-domain.js';

test('la localisation actuelle conserve les coordonnees GPS exactes', () => {
  const location = normalizeMessageLocation({
    kind: 'current',
    latitude: 34.68123456,
    longitude: -1.90876543,
    accuracy: 7.6,
    expiresInMinutes: 30,
  }, 1_000);

  assert.equal(location.latitude, 34.68123456);
  assert.equal(location.longitude, -1.90876543);
  assert.equal(location.accuracy, 8);
  assert.equal(location.precision, 'exact');
  assert.equal(location.expiresAt, 1_801_000);
});

test('une localisation GPS invalide reste refusee', () => {
  assert.equal(normalizeMessageLocation({
    kind: 'current', latitude: 94, longitude: -1.9,
  }), null);
});
