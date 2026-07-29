import assert from 'node:assert/strict';
import test from 'node:test';
import { createAdminFraudService } from '../services/admin-fraud.js';

function harness({ loadRelationalFraudState = null } = {}) {
  const db = {
    users: [
      { id: 'admin', name: 'Admin', isAdmin: true },
      {
        id: 'u-1',
        name: 'Alice',
        email: 'alice@example.test',
        phone: '0600000000',
        registerIp: '1.1.1.1',
        completed: 1,
        cancelRate: 0,
        createdAt: 1,
        kycStatus: 'verified',
      },
      {
        id: 'u-2',
        name: 'Bob',
        email: 'bob@example.test',
        phone: '0600000000',
        registerIp: '2.2.2.2',
        completed: 2,
        cancelRate: 0,
        createdAt: 2,
        kycStatus: 'rejected',
      },
      {
        id: 'u-3',
        name: 'Charlie',
        email: 'charlie@example.test',
        registerIp: '1.1.1.1',
        completed: 4,
        cancelRate: 0.5,
        createdAt: 3,
        kycStatus: 'verified',
      },
    ],
    transactions: [
      {
        id: 'tx-1',
        senderId: 'u-1',
        travelerId: 'u-2',
        recipientId: 'u-1',
        status: 'disputed',
        escrow: { amount: 10.25 },
      },
      {
        id: 'tx-2',
        senderId: 'u-1',
        travelerId: 'u-2',
        recipientId: 'u-1',
        status: 'released',
        escrow: { amount: 12 },
      },
      {
        id: 'tx-3',
        senderId: 'u-1',
        travelerId: 'u-2',
        recipientId: 'u-1',
        status: 'released',
        escrow: { amount: 7.75 },
      },
    ],
    disputes: [
      { id: 'd-1', txId: 'tx-1' },
      { id: 'd-2', txId: 'tx-2' },
    ],
  };
  const messages = [
    { id: 'm-1', from: 'u-1', flagged: true },
    { id: 'm-2', from: 'u-1', flagged: true },
    { id: 'm-3', from: 'u-2', flagged: false },
  ];
  const service = createAdminFraudService({
    db,
    findUser: (id) => db.users.find((user) => user.id === id),
    messagesRepository: {
      async all() {
        return messages;
      },
      async flaggedSenderCount() {
        return 1;
      },
    },
    kycRepository: {
      rejectionCountsByUser() {
        return { 'u-2': 2 };
      },
    },
    loadRelationalFraudState,
  });
  return { service };
}

test('resume fraude compte chaque participant une fois par litige', async () => {
  const { service } = harness();
  const summary = await service.summary();

  assert.deepEqual(summary, {
    linkedAccounts: 2,
    repeatPairs: 1,
    flaggedMessaging: 1,
    abnormalCancel: 1,
    disputeProne: 2,
    kycRepeatRejections: 1,
  });
});

test('fraude utilise les agregats relationnels quand ils sont disponibles', async () => {
  const { service } = harness({
    async loadRelationalFraudState() {
      return {
        repeatPairs: [{
          firstUserId: 'u-1',
          secondUserId: 'u-2',
          transactionCount: 7,
          disputedCount: 4,
          totalValueEur: 99,
        }],
        disputeCounts: { 'u-2': 3 },
      };
    },
  });

  const summary = await service.summary();
  const details = await service.details();

  assert.equal(summary.repeatPairs, 1);
  assert.equal(summary.disputeProne, 1);
  assert.equal(details.repeatPairs[0].totalValueEur, 99);
  assert.deepEqual(details.disputeProne, [{
    userId: 'u-2',
    name: 'Bob',
    disputeCount: 3,
  }]);
});

test('detail fraude projette et trie les signaux sans secrets membre', async () => {
  const { service } = harness();
  const details = await service.details();

  assert.equal(details.linkedAccounts.length, 2);
  assert.deepEqual(
    Object.keys(details.linkedAccounts[0].users[0]).sort(),
    ['createdAt', 'email', 'id', 'name'],
  );
  assert.equal(details.repeatPairs[0].transactionCount, 3);
  assert.equal(details.repeatPairs[0].disputedCount, 2);
  assert.equal(details.repeatPairs[0].totalValueEur, 30);
  assert.deepEqual(details.flaggedMessaging, [{
    userId: 'u-1',
    name: 'Alice',
    count: 2,
  }]);
  assert.equal(details.abnormalCancel[0].id, 'u-3');
  assert.deepEqual(
    details.disputeProne.map(({ userId }) => userId).sort(),
    ['u-1', 'u-2'],
  );
  assert.equal(details.kycRepeatRejections[0].currentStatus, 'rejected');
});
