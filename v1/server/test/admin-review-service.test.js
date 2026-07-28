import assert from 'node:assert/strict';
import test from 'node:test';
import { createAdminReviewService } from '../services/admin-review.js';

function harness({ type, refId, decision = 'approve' }) {
  const item = { id: 'review-1', type, refId };
  const calls = { audit: [], notify: [], save: 0, events: [], transitions: [] };
  const db = {
    listings: [{ id: 'listing-1', categoryId: 'documents', whitelistVerdict: 'gray', status: 'review' }],
    disputes: [{ id: 'dispute-1', txId: 'tx-1', status: 'open', createdAt: 1 }],
    transactions: [{
      id: 'tx-1',
      senderId: 'sender',
      travelerId: 'traveler',
      recipientId: 'recipient',
      status: 'disputed',
      escrow: { state: 'held' },
      events: [],
    }],
    conversations: [{
      id: 'conversation-1',
      reports: [{ id: 'report-1', at: 1 }],
    }],
  };
  const repositories = {
    reviewQueue: {
      find: (id) => id === item.id ? item : null,
      close: (target, value) => { target.status = value; },
    },
    customWhitelist: {
      hasIn: () => false,
      promoteFromListing: (listing, options) => { listing.promotedWith = options; },
    },
  };
  const service = createAdminReviewService({
    db,
    repositories,
    whitelist: {},
    transitionEscrow: (escrow, state) => {
      escrow.state = state;
      calls.transitions.push(state);
    },
    addEvent: (transaction, eventType, actorId, meta) => {
      calls.events.push({ transaction: transaction.id, eventType, actorId, meta });
    },
    audit: async (...args) => { calls.audit.push(args); },
    notify: async (...args) => { calls.notify.push(args); },
    save: () => { calls.save += 1; },
    now: () => 10_000,
  });
  return { service, db, calls, request: { actorId: 'admin', reviewId: item.id, decision, maxQty: 3 } };
}

test('revue admin publie et promeut une categorie grise', async () => {
  const { service, db, calls, request } = harness({ type: 'listing', refId: 'listing-1' });
  const result = await service.review(request);

  assert.equal(result.status, 200);
  assert.equal(db.listings[0].status, 'published');
  assert.deepEqual(db.listings[0].promotedWith, { maxQty: 3 });
  assert.equal(calls.audit[0][1], 'review.listing.approve');
  assert.equal(calls.save, 1);
});

test('revue admin resout un litige et notifie toutes les parties', async () => {
  const { service, db, calls, request } = harness({
    type: 'dispute',
    refId: 'dispute-1',
    decision: 'release_traveler',
  });
  const result = await service.review(request);

  assert.equal(result.status, 200);
  assert.equal(db.disputes[0].resolvedAt, 10_000);
  assert.equal(db.transactions[0].status, 'released');
  assert.deepEqual(calls.transitions, ['released']);
  assert.equal(calls.events[0].eventType, 'dispute_resolved');
  assert.equal(calls.notify.length, 1);
});

test('revue admin conserve auteur et decision sur chaque signalement', async () => {
  const { service, db, calls, request } = harness({
    type: 'conversation',
    refId: 'conversation-1',
    decision: 'dismissed',
  });
  await service.review(request);

  assert.equal(db.conversations[0].moderationStatus, 'dismissed');
  assert.equal(db.conversations[0].reports[0].reviewedBy, 'admin');
  assert.equal(db.conversations[0].reports[0].decision, 'dismissed');
  assert.equal(calls.audit[0][1], 'review.conversation.dismissed');
});
