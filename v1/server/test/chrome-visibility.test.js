import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldHideAppChrome } from '../../client/src/app/chromeVisibility.js';

test('app chrome disparait pendant les deux formulaires de trajet', () => {
  assert.equal(shouldHideAppChrome('/trajets/nouveau'), true);
  assert.equal(shouldHideAppChrome('/trajets/t-42/demande'), true);
  assert.equal(shouldHideAppChrome('/trajets/t-42/demande/'), true);
});

test('app chrome disparait pendant la verification KYC', () => {
  assert.equal(shouldHideAppChrome('/verification'), true);
  assert.equal(shouldHideAppChrome('/verification/'), true);
});

test('app chrome disparait uniquement dans le detail d une operation', () => {
  assert.equal(shouldHideAppChrome('/operations/tx-42'), true);
  assert.equal(shouldHideAppChrome('/operations/tx-42/'), true);
  assert.equal(shouldHideAppChrome('/en-cours'), false);
});

test('app chrome reste visible sur la liste et le detail des trajets', () => {
  assert.equal(shouldHideAppChrome('/trajets'), false);
  assert.equal(shouldHideAppChrome('/trajets/t-42'), false);
  assert.equal(shouldHideAppChrome('/en-cours'), false);
});

test('app chrome reste masque sur les ecrans publics existants', () => {
  assert.equal(shouldHideAppChrome('/connexion'), true);
  assert.equal(shouldHideAppChrome('/cgu'), true);
  assert.equal(shouldHideAppChrome('/confidentialite'), true);
});
