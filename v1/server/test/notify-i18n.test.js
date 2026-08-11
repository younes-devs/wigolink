import assert from 'node:assert/strict';
import test from 'node:test';
import { renderLegacyNotification, renderNotification } from '../notify-i18n.js';

test('notifications rendent les variables en anglais et espagnol', () => {
  const notification = { key: 'offer.received', params: { name: 'Nora', title: 'Diplôme' } };

  assert.equal(renderNotification('en', notification), 'Nora offers to transport “Diplôme”.');
  assert.equal(renderNotification('es', notification), 'Nora se ofrece a transportar «Diplôme».');
});

test('notifications ne rendent jamais un identifiant technique visible', () => {
  const notification = {
    key: 'offer.received',
    params: { name: 'Aya', title: 't-8a67f9ba1-22e4-45b1-aa8b-91d367784e7f' },
  };

  assert.doesNotMatch(renderNotification('fr', notification), /t-8a67/);
  assert.match(renderNotification('fr', notification), /cet envoi/);
  assert.doesNotMatch(renderNotification('en', notification), /t-8a67/);
  assert.match(renderNotification('en', notification), /this shipment/);
});

test('notifications historiques sont traduites en anglais et espagnol', () => {
  const legacy = 'Nora a retiré sa proposition.';

  assert.equal(renderLegacyNotification('en', legacy), 'Nora withdrew their offer.');
  assert.equal(renderLegacyNotification('es', legacy), 'Nora retiró su propuesta.');
});

test('la confirmation de versement est disponible dans les cinq langues', () => {
  const notification = { key: 'payout.sent' };

  assert.match(renderNotification('fr', notification), /versement.*confirmé/i);
  assert.match(renderNotification('en', notification), /payout.*confirmed/i);
  assert.match(renderNotification('es', notification), /pago.*confirmado/i);
  assert.match(renderNotification('nl', notification), /uitbetaling.*bevestigd/i);
  assert.match(renderNotification('ar', notification), /تأكيد/);
});
