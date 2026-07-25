import assert from 'node:assert/strict';
import test from 'node:test';
import { createMemberOverviewService } from '../services/member-overview.js';

function createHarness({
  users = [],
  trips = [],
  transactions = [],
  listings = [],
  matchingOffers = [],
  disputes = [],
  flaggedMessages = [],
  notifications = [],
  unreadMessages = 0,
} = {}) {
  const order = [];
  const db = {
    users,
    trips,
    transactions,
    listings,
    matchingOffers,
    disputes,
  };
  const service = createMemberOverviewService({
    db,
    publicUser: (user) => user && ({
      id: user.id,
      name: user.name,
    }),
    findUser: (id) => users.find((user) => user.id === id),
    isParty: (transaction, userId) => [
      transaction.senderId,
      transaction.travelerId,
      transaction.recipientId,
    ].includes(userId),
    closedStatuses: ['released', 'refunded', 'cancelled'],
    unreadConversationCount() {
      return unreadMessages;
    },
    flaggedMessagesRepository: {
      async flaggedFromUser() {
        return flaggedMessages;
      },
    },
    kycUserView: (user) => ({ status: user.kycStatus || 'none' }),
    async runMatchingOfferReminders() {
      order.push('reminders');
    },
    transactionView: (user) => (transaction) => ({
      id: transaction.id,
      status: transaction.status,
      createdAt: transaction.createdAt,
      myRole: transaction.senderId === user.id
        ? 'sender'
        : transaction.travelerId === user.id
          ? 'traveler'
          : 'recipient',
    }),
    matchesTrip: (listing, trip) =>
      listing.from === trip.from && listing.to === trip.to,
    normalizeMatchingOffer: (offer) => ({
      ...offer,
      normalized: true,
    }),
    notificationsRepository: {
      async listForUser(userId, options) {
        order.push(['notifications', userId, options]);
        return notifications;
      },
      async unreadCount(userId) {
        order.push(['unread', userId]);
        return notifications.filter((item) => !item.read).length;
      },
    },
    renderNotification: (lang, notification) =>
      `${lang}:${notification.key}`,
    today: () => '2026-07-25',
  });
  return { service, order };
}

test('navigation compte seulement messages et opérations à traiter', () => {
  const user = { id: 'u-1' };
  const transactions = [{
    id: 'confirm',
    senderId: 'sender',
    travelerId: 'u-1',
    status: 'accepted',
    operationStatus: 'attente_confirmation',
  }, {
    id: 'pay',
    senderId: 'u-1',
    travelerId: 'traveler',
    status: 'accepted',
  }, {
    id: 'closed',
    senderId: 'u-1',
    travelerId: 'traveler',
    status: 'released',
  }, {
    id: 'other',
    senderId: 'other',
    travelerId: 'another',
    status: 'accepted',
  }];
  const { service } = createHarness({
    transactions,
    unreadMessages: 4,
  });

  assert.deepEqual(service.navigation(user), {
    messagesUnread: 4,
    operationsActionRequired: 2,
  });
});

test('centre confiance calcule score, limites et actions de risque', async () => {
  const user = {
    id: 'u-1',
    name: 'Alice',
    emailVerified: true,
    kycStatus: 'pending',
    completed: 1,
    rating: 4,
    ratingCount: 1,
    cancelRate: 0,
    maxValue: 100,
    maxActive: 1,
    createdAt: 10,
  };
  const transactions = [{
    id: 'tx-active',
    senderId: 'u-1',
    travelerId: 'u-2',
    status: 'accepted',
  }, {
    id: 'tx-done',
    senderId: 'u-1',
    travelerId: 'u-2',
    status: 'released',
  }];
  const disputes = [{
    id: 'd-1',
    txId: 'tx-active',
    status: 'open',
    reason: 'preuve',
    createdAt: 20,
    evidence: [{}],
  }];
  const flaggedMessages = [{
    id: 'm-1',
    txId: 'tx-active',
    at: 30,
  }];
  const { service } = createHarness({
    users: [user],
    transactions,
    disputes,
    flaggedMessages,
  });

  const result = await service.trust(user);

  assert.equal(result.identity.kyc.status, 'pending');
  assert.equal(result.stats.active, 1);
  assert.equal(result.stats.released, 1);
  assert.equal(result.limits.completedForUpgrade, 1);
  assert.ok(result.score >= 0 && result.score <= 100);
  assert.deepEqual(
    result.actions.map((action) => action.id),
    [
      'verify-identity',
      'build-reviews',
      'answer-dispute',
      'keep-chat-in-app',
      'active-limit',
    ],
  );
  assert.equal(result.incidents.disputes[0].evidenceCount, 1);
  assert.equal(result.incidents.flaggedMessages[0].id, 'm-1');
});

test('dashboard agrège actions, matching, offres et notifications', async () => {
  const user = {
    id: 'u-1',
    name: 'Alice',
    kycStatus: 'verified',
    trainingDone: true,
    maxValue: 100,
    maxActive: 2,
    completed: 1,
    rating: 5,
  };
  const other = { id: 'u-2', name: 'Bob' };
  const trips = [{
    id: 'trip-1',
    travelerId: 'u-1',
    from: 'Paris',
    to: 'Bruxelles',
    date: '2026-08-01',
  }, {
    id: 'trip-old',
    travelerId: 'u-1',
    from: 'Paris',
    to: 'Bruxelles',
    date: '2026-01-01',
  }];
  const transactions = [{
    id: 'tx-1',
    senderId: 'u-1',
    travelerId: 'u-2',
    recipientId: 'u-1',
    status: 'accepted',
    createdAt: 50,
  }];
  const listings = [{
    id: 'mine',
    senderId: 'u-1',
    status: 'pending_review',
  }, {
    id: 'match',
    senderId: 'u-2',
    status: 'published',
    from: 'Paris',
    to: 'Bruxelles',
    createdAt: 40,
  }];
  const matchingOffers = [{
    id: 'offer-1',
    senderId: 'u-2',
    travelerId: 'u-1',
    listingId: 'match',
    status: 'pending_traveler',
    offeredPay: 12,
    createdAt: 60,
  }];
  const notifications = [{
    id: 'n-1',
    key: 'offer.received',
    read: false,
  }];
  const { service, order } = createHarness({
    users: [user, other],
    trips,
    transactions,
    listings,
    matchingOffers,
    notifications,
  });

  const result = await service.dashboard(user, 'fr');

  assert.deepEqual(result.trips.map((trip) => trip.id), ['trip-1']);
  assert.equal(result.actions[0].id, 'tx-1');
  assert.equal(result.matches[0].id, 'match');
  assert.equal(result.shipments.pendingReview, 1);
  assert.equal(result.offers.mineToAct, 1);
  assert.equal(result.offers.latest[0].waitingForMe, true);
  assert.equal(result.offers.latest[0].other.id, 'u-2');
  assert.equal(result.notifications[0].text, 'fr:offer.received');
  assert.equal(result.unread, 1);
  assert.deepEqual(order, [
    'reminders',
    ['notifications', 'u-1', { limit: 5 }],
    ['unread', 'u-1'],
  ]);
});
