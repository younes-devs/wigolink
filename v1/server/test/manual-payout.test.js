import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { manualPayoutConfiguration } from '../payments/manual-payout-config.js';
import { createManualPayoutCipher } from '../payments/manual-payout-crypto.js';
import { createStripePaymentService } from '../payments/stripe-service.js';

test('coordonnees de versement chiffrees restent opaques et authentifiees', () => {
  const key = crypto.randomBytes(32).toString('base64');
  const cipher = createManualPayoutCipher(key);
  const details = {
    holderName: 'Yassine Mahmoud',
    accountIdentifier: '123456789012345678901234',
  };
  const encrypted = cipher.encrypt(details);

  assert.equal(cipher.ready, true);
  assert.equal(encrypted.includes(details.holderName), false);
  assert.equal(encrypted.includes(details.accountIdentifier), false);
  assert.deepEqual(cipher.decrypt(encrypted), details);
  assert.throws(() => cipher.decrypt(`${encrypted.slice(0, -1)}A`));
});

test('mode manuel reste explicite et borne aux pays du pilote', () => {
  const config = manualPayoutConfiguration({
    PAYOUT_MODE: 'manual',
    MANUAL_PAYOUT_ENCRYPTION_KEY: crypto.randomBytes(32).toString('base64'),
    MANUAL_PAYOUT_COUNTRIES: 'MA, BE,FR',
  });

  assert.equal(config.enabled, true);
  assert.deepEqual([...config.allowedCountries], ['MA', 'BE', 'FR']);
});

test('livraison en mode manuel cree une demande sans appeler Stripe Transfers', async () => {
  const calls = [];
  const service = createStripePaymentService({
    getPool: () => ({ query() { throw new Error('La base Stripe ne doit pas etre appelee.'); } }),
    stripe: { transfers: { create() { throw new Error('Stripe Transfers ne doit pas etre appele.'); } } },
    config: {
      enabled: true,
      secretKey: 'sk_test_secret',
      webhookSecret: 'whsec_test',
      payoutMode: 'manual',
    },
    manualPayouts: {
      async queueAfterDelivery(operationId) {
        calls.push(operationId);
        return { status: 201, body: { request: { status: 'pending' } } };
      },
    },
  });

  const result = await service.releaseAfterDelivery('tx-delivered');

  assert.equal(result.status, 201);
  assert.deepEqual(calls, ['tx-delivered']);
});
