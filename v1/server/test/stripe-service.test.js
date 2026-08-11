import assert from 'node:assert/strict';
import test from 'node:test';
import { createStripePaymentService } from '../payments/stripe-service.js';

test('le service Stripe expose uniquement encaissement, webhook et remboursement', () => {
  const service = createStripePaymentService({
    getPool: () => null,
    stripe: {},
    config: stripeConfig(),
    logger: { error() {}, warn() {} },
  });

  assert.deepEqual(Object.keys(service).sort(), [
    'availability',
    'createCheckout',
    'handleWebhook',
    'refundOperation',
    'releaseAfterDelivery',
  ]);
});

test('la livraison delegue toujours le versement a la file manuelle', async () => {
  const calls = [];
  const service = createStripePaymentService({
    getPool: () => null,
    stripe: {},
    config: stripeConfig(),
    manualPayouts: {
      async queueAfterDelivery(operationId) {
        calls.push(operationId);
        return { status: 200, body: { queued: true } };
      },
    },
    logger: { error() {}, warn() {} },
  });

  assert.deepEqual(await service.releaseAfterDelivery('tx-1'), {
    status: 200,
    body: { queued: true },
  });
  assert.deepEqual(calls, ['tx-1']);
});

test('la livraison echoue clairement sans service de versement manuel', async () => {
  const service = createStripePaymentService({
    getPool: () => null,
    stripe: {},
    config: stripeConfig(),
    logger: { error() {}, warn() {} },
  });

  assert.deepEqual(await service.releaseAfterDelivery('tx-1'), {
    status: 503,
    body: { error: 'Versement manuel temporairement indisponible.' },
  });
});

test('Checkout exige un compte manuel verifie et ne prepare aucun transfert Stripe', async () => {
  const stripeCalls = [];
  const queries = [];
  const paymentRow = {
    currency: 'EUR',
    traveler_price_cents: 1_000,
    sender_fee_cents: 150,
    traveler_fee_cents: 150,
    charged_amount_cents: 1_150,
    traveler_transfer_cents: 850,
    platform_gross_cents: 300,
    payment_status: 'checkout_open',
    transfer_status: 'not_ready',
    fee_policy_version: '2026-08-tiered-v1',
  };
  const client = {
    async query(sql, params) {
      queries.push({ sql, params });
      if (sql.includes('select tx.data as operation')) {
        return { rows: [{
          operation: {
            id: 'tx-1',
            senderId: 'u-sender',
            travelerId: 'u-traveler',
            operationStatus: 'paiement_requis',
            shipmentType: 'document',
            title: 'Oujda vers Bruxelles',
            price: 10,
            currency: 'EUR',
            events: [],
          },
          sender: { id: 'u-sender', email: 'sender@example.com' },
          traveler: { id: 'u-traveler' },
          manual_payout_account_id: 'payout-1',
          manual_payout_account_status: 'verified',
        }] };
      }
      if (sql.includes('select * from public.operation_payments')) return { rows: [] };
      return { rows: [], rowCount: 1 };
    },
    release() {},
  };
  const pool = {
    async connect() { return client; },
    async query(sql) {
      queries.push({ sql, params: [] });
      if (sql.includes('returning *')) return { rows: [paymentRow] };
      return { rows: [], rowCount: 1 };
    },
  };
  const service = createStripePaymentService({
    getPool: () => pool,
    stripe: {
      checkout: {
        sessions: {
          async create(params, options) {
            stripeCalls.push({ params, options });
            return { id: 'cs_test_1', url: 'https://checkout.stripe.com/test' };
          },
        },
      },
    },
    config: stripeConfig(),
    now: () => 1_800_000_000_000,
    logger: { error() {}, warn() {} },
  });

  const result = await service.createCheckout({
    user: { id: 'u-sender' },
    operationId: 'tx-1',
    lang: 'fr',
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.checkoutUrl, 'https://checkout.stripe.com/test');
  assert.equal(stripeCalls[0].params.payment_method_types[0], 'card');
  assert.equal(stripeCalls[0].params.payment_intent_data.transfer_data, undefined);
  assert.equal(stripeCalls[0].params.metadata.wigolink_traveler_payout_cents, '850');
  assert.equal(stripeCalls[0].options.idempotencyKey, 'checkout:tx-1:2026-08-tiered-v1:1');
  assert.equal(queries.some(({ sql }) => sql.includes('stripe_connected_accounts')), false);
  assert.equal(queries.some(({ sql }) => sql.includes("'manual'")), true);
});

function stripeConfig() {
  return {
    enabled: true,
    secretKey: 'sk_test_secret',
    webhookSecret: 'whsec_test',
    appUrl: 'https://wigolink.com',
  };
}
