import assert from 'node:assert/strict';
import test from 'node:test';
import { createOperationReadService } from '../services/operation-reads.js';

function transaction(overrides = {}) {
  return {
    id: 'tx-1',
    senderId: 'u-sender',
    travelerId: 'u-traveler',
    status: 'accepted',
    createdAt: 100,
    ...overrides,
  };
}

function createService(transactions) {
  return createOperationReadService({
    db: { transactions },
    isClosedStatus: (status) => [
      'released',
      'refunded',
      'cancelled',
    ].includes(status),
    isParty: (item, userId) => [
      item.senderId,
      item.travelerId,
      item.recipientId,
    ].includes(userId),
    operationView: (item, user) => ({
      id: item.id,
      status: item.status,
      viewerId: user.id,
    }),
  });
}

test('operation reads separate active operations from history', () => {
  const service = createService([
    transaction({ id: 'tx-old', status: 'released', createdAt: 100 }),
    transaction({ id: 'tx-new', createdAt: 300 }),
    transaction({
      id: 'tx-other',
      senderId: 'u-other',
      travelerId: 'u-another',
      createdAt: 500,
    }),
  ]);
  const user = { id: 'u-sender' };

  assert.deepEqual(
    service.operations(user).operations.map(({ id }) => id),
    ['tx-new'],
  );
  assert.deepEqual(
    service.operations(user, { history: '1' }).operations.map(({ id }) => id),
    ['tx-old'],
  );
});

test('operation detail protects third parties and allows administrators', () => {
  const service = createService([transaction()]);

  assert.equal(service.operation('missing', { id: 'u-sender' }).status, 404);
  assert.equal(service.operation('tx-1', { id: 'u-other' }).status, 403);
  assert.equal(
    service.operation('tx-1', { id: 'u-admin', isAdmin: true }).status,
    200,
  );
  assert.equal(
    service.operation('tx-1', { id: 'u-traveler' }).body.operation.id,
    'tx-1',
  );
});
