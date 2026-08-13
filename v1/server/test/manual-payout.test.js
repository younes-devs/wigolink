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
    MANUAL_PAYOUT_COUNTRIES: 'MA,FR,BE,ES,NL',
  });

  assert.equal(config.enabled, true);
  assert.deepEqual([...config.allowedCountries], ['MA', 'FR', 'BE', 'ES', 'NL']);
});

test('les cinq pays de versement sont actifs par defaut', () => {
  const config = manualPayoutConfiguration({
    MANUAL_PAYOUT_ENCRYPTION_KEY: crypto.randomBytes(32).toString('base64'),
  });

  assert.deepEqual([...config.allowedCountries], ['MA', 'FR', 'BE', 'ES', 'NL']);
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
      MANUAL_PAYOUT_COUNTRIES: 'MA,FR,BE,ES,NL',
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
  assert.equal(result.body.payout.bankName, 'CIH');
  assert.equal('accountIdentifier' in result.body.payout, false);
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
  const queries = [];
  const pool = transactionalPool((sql) => {
    queries.push(sql);
    if (sql.includes('select request.*')) return { rows: [{
      operation: { id: 'tx-test', travelerId: 'u-traveler', status: 'completed', events: [], escrow: {} },
      traveler_id: 'u-traveler',
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
  assert.equal(queries.some((sql) => sql.includes('insert into public.notifications')), true);
  assert.equal(connectionActive, false);
});

test('la file admin commence par les compteurs de versement par pays', async () => {
  const audits = [];
  const pool = {
    async query(sql) {
      assert.match(sql, /group by account\.country/);
      return { rows: [{ country: 'MA', count: 4 }, { country: 'FR', count: 2 }] };
    },
  };
  const service = createManualPayoutService({
    getPool: () => pool,
    config: manualConfig(),
    audit: async (...args) => audits.push(args),
  });

  const result = await service.listRequests({ admin: { id: 'u-admin' } });

  assert.equal(result.status, 200);
  assert.deepEqual(result.body.requests, []);
  assert.deepEqual(result.body.counts, { MA: 4, FR: 2, BE: 0, ES: 0, NL: 0 });
  assert.equal(result.body.selectedCountry, null);
  assert.equal(audits[0][1], 'manual_payout_countries_viewed');
});

test('la file admin filtre les versements dans le pays choisi', async () => {
  const key = crypto.randomBytes(32).toString('base64');
  const config = manualPayoutConfiguration({
    MANUAL_PAYOUT_ENCRYPTION_KEY: key,
    MANUAL_PAYOUT_COUNTRIES: 'MA,FR,BE,ES,NL',
  });
  const cipher = createManualPayoutCipher(key);
  const queries = [];
  const pool = {
    async query(sql, params = []) {
      queries.push({ sql, params });
      if (sql.includes('group by account.country')) return { rows: [{ country: 'BE', count: 1 }] };
      return { rows: [{
        operation_id: 'tx-be', traveler_id: 'u-traveler', amount_cents: 850,
        currency: 'EUR', status: 'pending', requested_at: new Date('2026-08-13T10:00:00Z'),
        country: 'BE', details_ciphertext: cipher.encrypt({
          holderName: 'Aya Stouti', bankName: 'Belfius',
          accountIdentifier: 'BE68539007547034', bic: 'GKCCBEBB', phone: '',
        }),
        traveler: { name: 'Aya Stouti', email: 'aya@example.com', kycStatus: 'verified' },
        operation: { from: 'Bruxelles', to: 'Paris' },
      }] };
    },
  };
  const service = createManualPayoutService({ getPool: () => pool, config });

  const result = await service.listRequests({ admin: { id: 'u-admin' }, country: 'BE' });

  assert.equal(result.status, 200);
  assert.equal(result.body.selectedCountry, 'BE');
  assert.equal(result.body.requests.length, 1);
  assert.equal(result.body.requests[0].bank.country, 'BE');
  assert.equal(queries[1].params[1], 'BE');
});

function manualConfig() {
  return manualPayoutConfiguration({
    MANUAL_PAYOUT_ENCRYPTION_KEY: crypto.randomBytes(32).toString('base64'),
    MANUAL_PAYOUT_COUNTRIES: 'MA,FR,BE,ES,NL',
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
