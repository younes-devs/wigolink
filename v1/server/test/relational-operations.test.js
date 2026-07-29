import assert from 'node:assert/strict';
import test from 'node:test';
import {
  listRelationalOperations,
  relationalOperation,
  relationalOperationReadsEnabled,
} from '../relational-operations.js';

const row = {
  transaction: {
    id: 'tx-1',
    tripId: 't-1',
    senderId: 'u-1',
    travelerId: 'u-2',
    recipientId: 'u-1',
    status: 'accepted',
    operationStatus: 'paiement_requis',
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
    query: { history: '0', limit: 20 },
    operationCodePublicState: (code) => ({
      issued: !!code,
      expiresAt: code?.expiresAt || null,
    }),
    disputeView: (value) => value,
  });

  assert.equal(result.operations[0].title, 'Oujda -> Bruxelles');
  assert.equal(result.operations[0].sender.name, 'Younes');
  assert.equal(result.operations[0].security.pickup.issued, true);
  assert.equal(result.operations[0].security.pickup.canEnter, false);
  assert.equal('securityCodes' in result.operations[0], false);
  assert.equal(result.page.hasMore, false);
  assert.match(calls[0].sql, /wigofly_transactions/);
  assert.match(calls[0].sql, /senderId/);
  assert.deepEqual(calls[0].params.slice(0, 2), [
    'u-1',
    ['released', 'refunded', 'cancelled'],
  ]);
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
});
