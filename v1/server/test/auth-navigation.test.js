import assert from 'node:assert/strict';
import test from 'node:test';
import { loginPath, safeReturnPath } from '../../client/src/app/authNavigation.js';

test('auth navigation retire le prefixe localise des chemins de retour', () => {
  assert.equal(safeReturnPath('/fr/trajets/t-42?source=message#details'), '/trajets/t-42?source=message#details');
  assert.equal(loginPath('/ar/en-cours'), '/connexion?retour=%2Fen-cours');
});

test('auth navigation refuse les retours externes et les boucles de connexion', () => {
  assert.equal(safeReturnPath('https://example.com'), '/trajets');
  assert.equal(safeReturnPath('//example.com'), '/trajets');
  assert.equal(safeReturnPath('/es/connexion?retour=%2Fadmin'), '/trajets');
});
