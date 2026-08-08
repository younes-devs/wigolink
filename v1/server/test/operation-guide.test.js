import assert from 'node:assert/strict';
import test from 'node:test';
import {
  operationGuideSteps, operationNeedsAction, operationStepIndex,
} from '../../client/src/features/operations/utils/operationGuide.js';

test('le guide operation suit les cinq etapes metier', () => {
  assert.equal(operationStepIndex('attente_confirmation'), 0);
  assert.equal(operationStepIndex('paiement_requis'), 1);
  assert.equal(operationStepIndex('paye'), 2);
  assert.equal(operationStepIndex('en_transport'), 3);
  assert.equal(operationStepIndex('termine'), 4);
});

test('le guide affiche des consignes differentes selon le role', () => {
  const sender = operationGuideSteps({ myRole: 'sender', operationStatus: 'paye' });
  const traveler = operationGuideSteps({ myRole: 'traveler', operationStatus: 'paye' });
  assert.notEqual(sender[0].labelKey, traveler[0].labelKey);
  assert.notEqual(sender[2].detailKey, traveler[2].detailKey);
  assert.equal(sender[2].state, 'current');
  assert.equal(traveler[2].state, 'current');
});

test('le guide distingue une action disponible d une attente', () => {
  assert.equal(operationNeedsAction({ myRole: 'traveler', operationStatus: 'attente_confirmation' }), true);
  assert.equal(operationNeedsAction({ myRole: 'sender', operationStatus: 'attente_confirmation' }), false);
  assert.equal(operationNeedsAction({ myRole: 'sender', operationStatus: 'paiement_requis' }), true);
  assert.equal(operationNeedsAction({ myRole: 'traveler', operationStatus: 'paiement_requis' }), false);
  assert.equal(operationNeedsAction({ operationStatus: 'paye', security: { pickup: { canEnter: true, issued: false } } }), false);
  assert.equal(operationNeedsAction({ operationStatus: 'paye', security: { pickup: { canEnter: true, issued: true } } }), true);
});
