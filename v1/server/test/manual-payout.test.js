import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { manualPayoutConfiguration } from '../payments/manual-payout-config.js';
import { createManualPayoutCipher } from '../payments/manual-payout-crypto.js';
import { createManualPayoutService } from '../payments/manual-payout-service.js';
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
  const tamperedParts = encrypted.split('.');
  tamperedParts[3] = `${tamperedParts[3][0] === 'A' ? 'B' : 'A'}${tamperedParts[3].slice(1)}`;
  assert.throws(() => cipher.decrypt(tamperedParts.join('.')));
});

test('mode manuel reste explicite et borne aux pays du pilote', () => {
  const config = manualPayoutConfiguration({
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

test('enregistrer la banque libere la connexion avant de reprendre les versements', async () => {
  let connectionActive = false;
  const account = {
    id: 'mpa-test',
    user_id: 'u-test',
    country: 'MA',
    account_last4: '1234',
    status: 'verified',
  };
  const pool = {
    async connect() {
      assert.equal(connectionActive, false);
      connectionActive = true;
      return {
        async query(sql) {
          if (sql.includes('returning *')) return { rows: [account] };
          return { rows: [] };
        },
        release() { connectionActive = false; },
      };
    },
    async query() {
      assert.equal(connectionActive, false, 'la connexion transactionnelle doit etre liberee');
      return { rows: [] };
    },
  };
  const service = createManualPayoutService({
    getPool: () => pool,
    config: manualPayoutConfiguration({
      MANUAL_PAYOUT_ENCRYPTION_KEY: crypto.randomBytes(32).toString('base64'),
      MANUAL_PAYOUT_COUNTRIES: 'MA,BE,FR',
    }),
  });

  const result = await service.saveAccount({
    user: { id: 'u-test' },
    body: {
      country: 'MA',
      holderName: 'Yassine Mahmoud',
      bankName: 'CIH',
      accountIdentifier: '123456789012345678901234',
      phone: '0652495627',
    },
  });

  assert.equal(result.status, 201);
  assert.equal(result.body.payout.accountLast4, '1234');
  assert.equal(connectionActive, false);
});

test('creer la demande de versement libere la connexion avant l audit', async () => {
  let connectionActive = false;
  const pool = transactionalPool((sql) => {
    if (sql.includes('select payment.*')) return { rows: [{
      operation: {
        id: 'tx-test', travelerId: 'u-traveler', operationStatus: 'termine', status: 'completed', events: [],
      },
      payout_account_id: 'mpa-test',
      payment_status: 'paid',
      stripe_charge_id: 'ch_test',
      traveler_transfer_cents: 750,
      currency: 'EUR',
    }] };
    if (sql.includes('insert into public.manual_payout_requests')) return { rows: [{
      operation_id: 'tx-test', amount_cents: 750, currency: 'EUR', status: 'pending', requested_at: 1,
    }] };
    return { rows: [] };
  }, (active) => { connectionActive = active; });
  const service = createManualPayoutService({
    getPool: () => pool,
    config: manualConfig(),
    audit: async () => assert.equal(connectionActive, false, 'la connexion doit etre liberee avant l audit'),
  });

  const result = await service.queueAfterDelivery('tx-test');

  assert.equal(result.status, 201);
  assert.equal(result.body.request.amountCents, 750);
  assert.equal(connectionActive, false);
});

test('confirmer le virement admin libere la connexion avant l audit', async () => {
  let connectionActive = false;
  const pool = transactionalPool((sql) => {
    if (sql.includes('select request.*')) return { rows: [{
      operation: { id: 'tx-test', status: 'completed', events: [], escrow: {} },
      status: 'pending', amount_cents: 750, currency: 'EUR',
    }] };
    if (sql.includes('update public.manual_payout_requests')) return { rows: [{
      operation_id: 'tx-test', amount_cents: 750, currency: 'EUR', status: 'sent', processed_at: 2,
    }] };
    return { rows: [] };
  }, (active) => { connectionActive = active; });
  const service = createManualPayoutService({
    getPool: () => pool,
    config: manualConfig(),
    audit: async () => assert.equal(connectionActive, false, 'la connexion doit etre liberee avant l audit'),
  });

  const result = await service.markSent({
    admin: { id: 'u-admin' }, operationId: 'tx-test', reference: 'BANK-2026-001',
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.request.status, 'sent');
  assert.equal(connectionActive, false);
});

function manualConfig() {
  return manualPayoutConfiguration({
    MANUAL_PAYOUT_ENCRYPTION_KEY: crypto.randomBytes(32).toString('base64'),
    MANUAL_PAYOUT_COUNTRIES: 'MA,BE,FR',
  });
}

function transactionalPool(queryResult, setActive) {
  return {
    async connect() {
      setActive(true);
      return {
        async query(sql) { return queryResult(sql); },
        release() { setActive(false); },
      };
    },
  };
}
