import assert from 'node:assert/strict';
import test from 'node:test';
import { createOperationReadService } from '../services/operation-reads.js';

function createHarness({
  transactions = [],
  listings = [],
} = {}) {
  const db = { transactions, listings };
  const service = createOperationReadService({
    db,
    isClosedStatus(status) {
      return ['released', 'refunded', 'cancelled'].includes(status);
    },
    isParty(transaction, userId) {
      return [
        transaction.senderId,
        transaction.travelerId,
        transaction.recipientId,
      ].includes(userId);
    },
    operationView(transaction, user) {
      return {
        id: transaction.id,
        status: transaction.status,
        viewerId: user.id,
        kind: 'operation',
      };
    },
    transactionView(user) {
      return (transaction) => ({
        id: transaction.id,
        status: transaction.status,
        viewerId: user.id,
        kind: 'transaction',
        escrow: transaction.escrow,
      });
    },
  });
  return { db, service };
}

function transaction(overrides = {}) {
  return {
    id: 'tx-1',
    senderId: 'u-sender',
    travelerId: 'u-traveler',
    recipientId: 'u-sender',
    listingId: 'l-1',
    status: 'accepted',
    createdAt: 100,
    escrow: { state: 'pending', amount: 10 },
    ...overrides,
  };
}

test('operation reads sépare actif et historique du membre', () => {
  const { service } = createHarness({
    transactions: [
      transaction({ id: 'tx-old', status: 'released', createdAt: 100 }),
      transaction({ id: 'tx-new', status: 'accepted', createdAt: 300 }),
      transaction({
        id: 'tx-other',
        senderId: 'u-other',
        travelerId: 'u-another',
        recipientId: 'u-other',
        createdAt: 500,
      }),
    ],
  });
  const user = { id: 'u-sender' };

  assert.deepEqual(
    service.operations(user).operations.map((item) => item.id),
    ['tx-new'],
  );
  assert.deepEqual(
    service.operations(user, { history: '1' }).operations
      .map((item) => item.id),
    ['tx-old'],
  );
  assert.deepEqual(
    service.transactions(user).transactions,
    [{
      id: 'tx-new',
      status: 'accepted',
      viewerId: 'u-sender',
      kind: 'transaction',
      escrow: { state: 'pending', amount: 10 },
    }],
  );
});

test('operation detail protège les tiers et autorise admin', () => {
  const { service } = createHarness({
    transactions: [transaction()],
  });

  assert.equal(
    service.operation('missing', { id: 'u-sender' }).status,
    404,
  );
  assert.equal(
    service.operation('tx-1', { id: 'u-other' }).status,
    403,
  );
  assert.equal(
    service.operation('tx-1', { id: 'u-admin', isAdmin: true }).status,
    200,
  );
  assert.equal(
    service.transaction('tx-1', { id: 'u-other' }).status,
    403,
  );
  assert.equal(
    service.transaction('tx-1', { id: 'u-traveler' }).body.transaction.id,
    'tx-1',
  );
});

test('command center choisit la transaction la plus récente', () => {
  const { service } = createHarness({
    listings: [{
      id: 'l-1',
      senderId: 'u-sender',
      title: 'Diplôme',
      status: 'matched',
      valueEur: 200,
      from: 'Casablanca',
      whitelistVerdict: 'gray',
      createdAt: 100,
    }],
    transactions: [
      transaction({
        id: 'tx-old',
        status: 'accepted',
        createdAt: 100,
        escrow: { state: 'pending', amount: 10 },
      }),
      transaction({
        id: 'tx-new',
        status: 'in_transit',
        createdAt: 300,
        escrow: { state: 'held', amount: 18 },
      }),
    ],
  });

  const result = service.commandCenter({ id: 'u-sender' }).commandCenter;

  assert.equal(result.totals.total, 1);
  assert.equal(result.totals.matched, 1);
  assert.equal(result.totals.inTransit, 1);
  assert.equal(result.totals.escrowHeld, 18);
  assert.equal(result.items[0].transaction.id, 'tx-new');
  assert.equal(result.items[0].action.id, 'track');
  assert.equal(result.items[0].risk.customs, false);
  assert.equal(result.items[0].risk.gray, true);
  assert.equal(result.actions[0].listingId, 'l-1');
});

test('command center expose revue et risque douanier sans transaction', () => {
  const { service } = createHarness({
    listings: [{
      id: 'l-1',
      senderId: 'u-sender',
      title: 'Objet',
      status: 'pending_review',
      valueEur: 500,
      from: 'Casablanca',
      whitelistVerdict: 'gray',
      createdAt: 100,
    }],
  });

  const item = service.commandCenter({
    id: 'u-sender',
  }).commandCenter.items[0];

  assert.equal(item.transaction, null);
  assert.equal(item.action.id, 'review');
  assert.equal(item.risk.customs, true);
  assert.equal(item.risk.gray, true);
});
