import test from 'node:test';
import assert from 'node:assert/strict';
import {
  stripeConfiguration,
  stripePaymentsEnabled,
} from '../payments/stripe-config.js';

test('Stripe reste inactif sans activation explicite', () => {
  assert.equal(stripePaymentsEnabled({}), false);
  assert.equal(stripePaymentsEnabled({ PAYMENT_PROVIDER: 'stripe' }), true);
});

test('la configuration exige uniquement les secrets serveur', () => {
  const incomplete = stripeConfiguration({
    PAYMENT_PROVIDER: 'stripe',
    STRIPE_SECRET_KEY: 'sk_test_example',
  });
  assert.equal(incomplete.enabled, true);
  assert.equal(incomplete.ready, false);

  const ready = stripeConfiguration({
    PAYMENT_PROVIDER: 'stripe',
    STRIPE_SECRET_KEY: 'sk_test_example',
    STRIPE_WEBHOOK_SECRET: 'whsec_example',
    APP_URL: 'https://wigolink.com/',
  });
  assert.equal(ready.ready, true);
  assert.equal(ready.appUrl, 'https://wigolink.com');
});
