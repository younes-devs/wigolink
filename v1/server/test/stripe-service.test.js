import assert from 'node:assert/strict';
import test from 'node:test';
import { createStripePaymentService } from '../payments/stripe-service.js';

test('onboarding integre cree une session limitee au compte du membre', async () => {
  const calls = [];
  const pool = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql.includes('from public.stripe_connected_accounts')) {
        return { rows: [{
          user_id: 'u-traveler',
          stripe_account_id: 'acct_connected',
          country: 'BE',
        }] };
      }
      throw new Error(`SQL inattendu: ${sql}`);
    },
  };
  const stripeCalls = [];
  const service = createStripePaymentService({
    getPool: () => pool,
    stripe: {
      accountSessions: {
        async create(params) {
          stripeCalls.push(params);
          return {
            client_secret: 'acs_secret_temporarily_exposed_to_browser',
            expires_at: 1_800_000_000,
          };
        },
      },
    },
    config: stripeConfig(),
    logger: { error() {}, warn() {} },
  });

  const result = await service.createEmbeddedOnboardingSession({
    user: { id: 'u-traveler', email: 'traveler@example.com' },
    country: 'BE',
  });

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, {
    clientSecret: 'acs_secret_temporarily_exposed_to_browser',
    publishableKey: 'pk_test_public',
    expiresAt: 1_800_000_000,
  });
  assert.equal(calls[0].params[0], 'u-traveler');
  assert.deepEqual(stripeCalls, [{
    account: 'acct_connected',
    components: {
      account_onboarding: {
        enabled: true,
        features: { external_account_collection: true },
      },
    },
  }]);
});

test('onboarding integre refuse une cle publique absente', async () => {
  const service = createStripePaymentService({
    getPool: () => ({ query() { throw new Error('La base ne doit pas etre appelee.'); } }),
    stripe: {},
    config: { ...stripeConfig(), publishableKey: '' },
    logger: { error() {}, warn() {} },
  });

  const result = await service.createEmbeddedOnboardingSession({
    user: { id: 'u-traveler' },
    country: 'BE',
  });

  assert.equal(result.status, 503);
});

function stripeConfig() {
  return {
    enabled: true,
    secretKey: 'sk_test_secret',
    publishableKey: 'pk_test_public',
    webhookSecret: 'whsec_test',
    allowedConnectedCountries: new Set(['BE']),
    appUrl: 'https://wigolink.com',
  };
}
