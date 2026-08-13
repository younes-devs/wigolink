import assert from 'node:assert/strict';
import test from 'node:test';
import {
  listRelationalOperations,
  relationalOperation,
  relationalOperationReadsEnabled,
} from '../relational-operations.js';
import { encodePageCursor } from '../pagination-cursor.js';

const row = {
  transaction: {
    id: 'tx-1',
    tripId: 't-1',
    senderId: 'u-1',
    travelerId: 'u-2',
    recipientId: 'u-1',
    status: 'accepted',
    operationStatus: 'paiement_requis',
    shipmentType: 'parcel',
    parcelPhotos: [{ id: 'parcel-1', storagePath: 'requests/u/private.jpg', mime: 'image/jpeg', size: 1234 }],
    price: 15,
    createdAt: 300,
    securityCodes: {
      pickup: { hash: 'secret', expiresAt: 500 },
    },
  },
  trip: {
    id: 't-1',
    travelerId: 'u-2',
    from: 'Oujda',
    to: 'Bruxelles',
    date: '2026-08-01',
    price: 25,
  },
  listing: null,
  dispute: null,
  sender: { id: 'u-1', name: 'Younes' },
  traveler: { id: 'u-2', name: 'Karim' },
  recipient: { id: 'u-1', name: 'Younes' },
  conversation_id: 'conv-1',
};

test('operations relationnelles : option inactive par defaut', () => {
  assert.equal(relationalOperationReadsEnabled({}), false);
  assert.equal(
    relationalOperationReadsEnabled({ RELATIONAL_OPERATION_READS: 'true' }),
    true,
  );
});

test('operations relationnelles : liste paginee par participant sans secret', async () => {
  const calls = [];
  const result = await listRelationalOperations({
    pool: {
      query(sql, params) {
        calls.push({ sql, params });
        return { rows: [row] };
      },
    },
    user: { id: 'u-1' },
    query: { history: '0', shipmentType: 'parcel', limit: 20 },
    operationCodePublicState: (code) => ({
      issued: !!code,
      expiresAt: code?.expiresAt || null,
    }),
    disputeView: (value) => value,
  });

  assert.equal(result.operations[0].title, 'Oujda -> Bruxelles');
  assert.equal(result.operations[0].sender.name, 'Younes');
  assert.equal(result.operations[0].myRole, 'sender');
  assert.equal(result.operations[0].conversationId, 'conv-1');
  assert.equal(result.operations[0].security.pickup.issued, true);
  assert.equal(result.operations[0].security.pickup.canEnter, false);
  assert.equal('securityCodes' in result.operations[0], false);
  assert.equal(result.operations[0].parcelPhotos[0].storagePath, undefined);
  assert.equal(result.operations[0].parcelPhotos[0].url, '/operations/tx-1/parcel-photos/parcel-1');
  assert.equal(result.page.hasMore, false);
  assert.match(calls[0].sql, /wigolink_transactions/);
  assert.match(calls[0].sql, /@> array\[\$1\]::text\[\]/);
  assert.deepEqual(calls[0].params.slice(0, 2), [
    'u-1',
    ['delivery_confirmed', 'released', 'refunded', 'cancelled'],
  ]);
  assert.equal(calls[0].params[3], 'parcel');
  assert.match(calls[0].sql, /shipmentType/);
});

test('operations relationnelles : une livraison confirmee appartient a l historique', async () => {
  const calls = [];
  await listRelationalOperations({
    pool: {
      query(sql, params) {
        calls.push({ sql, params });
        return { rows: [] };
      },
    },
    user: { id: 'u-1' },
    query: { history: '1' },
    operationCodePublicState: () => ({}),
  });

  assert.equal(calls[0].params[2], true);
  assert.equal(calls[0].params[3], null);
  assert.ok(calls[0].params[1].includes('delivery_confirmed'));
});

test('operations relationnelles : poursuit avec un curseur stable sans offset', async () => {
  const calls = [];
  await listRelationalOperations({
    pool: {
      query(sql, params) {
        calls.push({ sql, params });
        return { rows: [{ ...row, sort_at: 300, sort_id: 'tx-1' }] };
      },
    },
    user: { id: 'u-1' },
    query: {
      history: '0',
      limit: 20,
      cursor: encodePageCursor({ at: 400, id: 'tx-0' }),
    },
    operationCodePublicState: () => ({}),
  });

  assert.match(calls[0].sql, /tx\.id > \$6/);
  assert.doesNotMatch(calls[0].sql, /offset \$/i);
  assert.deepEqual(calls[0].params.slice(2), [false, null, 400, 'tx-0', 21]);
});

test('operations relationnelles : detail refuse un tiers et autorise un admin', async () => {
  const pool = {
    query() {
      return { rows: [row] };
    },
  };
  const denied = await relationalOperation({
    pool,
    user: { id: 'u-other' },
    id: 'tx-1',
  });
  assert.equal(denied.status, 403);

  const allowed = await relationalOperation({
    pool,
    user: { id: 'u-admin', isAdmin: true },
    id: 'tx-1',
    operationCodePublicState: () => ({}),
  });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.body.operation.id, 'tx-1');

  const traveler = await relationalOperation({
    pool,
    user: { id: 'u-2' },
    id: 'tx-1',
    operationCodePublicState: () => ({}),
  });
  assert.equal(traveler.body.operation.myRole, 'traveler');
});

test('operation voyageur expose le compte manuel et normalise le prix avant paiement', async () => {
  const previousProvider = process.env.PAYMENT_PROVIDER;
  process.env.PAYMENT_PROVIDER = 'stripe';
  try {
    const operationRow = {
      ...row,
      transaction: {
        ...row.transaction,
        price: 9,
        payment: {
          currency: 'EUR',
          priceCents: 900,
          senderFeeCents: 150,
          travelerFeeCents: 150,
          chargedAmountCents: 1050,
          travelerTransferCents: 750,
          platformGrossCents: 300,
          feePolicyVersion: 'test-v1',
        },
      },
      payout_record: null,
      manual_payout_record: {
        country: 'MA',
        status: 'verified',
      },
    };
    const result = await relationalOperation({
      pool: { query: () => ({ rows: [operationRow] }) },
      user: { id: 'u-2' },
      id: 'tx-1',
      operationCodePublicState: () => ({}),
    });

    assert.equal(result.status, 200);
    assert.equal(result.body.operation.payout.ready, true);
    assert.equal(result.body.operation.payout.mode, 'manual');
    assert.equal(result.body.operation.paymentDetails.travelerPriceCents, 900);
    assert.equal(result.body.operation.paymentDetails.travelerTransferCents, 750);
  } finally {
    if (previousProvider === undefined) delete process.env.PAYMENT_PROVIDER;
    else process.env.PAYMENT_PROVIDER = previousProvider;
  }
});
