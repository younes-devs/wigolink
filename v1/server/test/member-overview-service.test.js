import assert from 'node:assert/strict';
import test from 'node:test';
import { createMemberOverviewService } from '../services/member-overview.js';

function createService(transactions, unreadMessages = 0) {
  return createMemberOverviewService({
    db: { transactions },
    isParty: (transaction, userId) => [
      transaction.senderId,
      transaction.travelerId,
      transaction.recipientId,
    ].includes(userId),
    closedStatuses: ['delivery_confirmed', 'released', 'refunded', 'cancelled'],
    unreadConversationCount: () => unreadMessages,
  });
}

test('navigation counts only unread messages and operations requiring action', () => {
  const user = { id: 'u-1' };
  const service = createService([{
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
    operationStatus: 'paiement_requis',
  }, {
    id: 'closed',
    senderId: 'u-1',
    travelerId: 'traveler',
    status: 'released',
  }, {
    id: 'delivered',
    senderId: 'u-1',
    travelerId: 'traveler',
    status: 'delivery_confirmed',
    operationStatus: 'paiement_requis',
  }, {
    id: 'other',
    senderId: 'other',
    travelerId: 'another',
    status: 'accepted',
  }], 4);

  assert.deepEqual(service.navigation(user), {
    messagesUnread: 4,
    operationsActionRequired: 2,
  });
});
