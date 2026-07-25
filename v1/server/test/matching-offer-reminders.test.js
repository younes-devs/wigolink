import assert from 'node:assert/strict';
import test from 'node:test';
import { createMatchingOfferReminderJob } from '../jobs/matching-offer-reminders.js';

const NOW = 10_000;
const REMINDER_MS = 6 * 60 * 60 * 1_000;

function createJob({
  matchingOffers = [],
  listings = [],
  normalizedChanged = false,
  waitingUser = (offer) => (
    offer.status === 'pending_traveler' ? offer.travelerId : offer.senderId
  ),
} = {}) {
  const db = { matchingOffers, listings };
  const notifications = [];
  const events = [];
  let saveCalls = 0;
  const job = createMatchingOfferReminderJob({
    db,
    normalizeMatchingOffers() {
      events.push('normalize:all');
      return normalizedChanged;
    },
    normalizeMatchingOffer(offer) {
      events.push(`normalize:${offer.id}`);
    },
    matchingOfferWaitingUser: waitingUser,
    async notify(...args) {
      events.push('notify:start');
      notifications.push(args);
      await Promise.resolve();
      events.push('notify:done');
    },
    save() {
      events.push('save');
      saveCalls += 1;
    },
    reminderMs: REMINDER_MS,
    now: () => NOW,
  });

  return {
    db,
    events,
    job,
    notifications,
    get saveCalls() {
      return saveCalls;
    },
  };
}

test('matching offer reminder job notifie le voyageur avant expiration puis sauvegarde', async () => {
  const offer = {
    id: 'o-1',
    listingId: 'l-1',
    senderId: 'u-sender',
    travelerId: 'u-traveler',
    status: 'pending_traveler',
    expiresAt: NOW + REMINDER_MS,
  };
  const harness = createJob({
    matchingOffers: [offer],
    listings: [{ id: 'l-1', title: 'Diplome' }],
  });

  assert.equal(await harness.job({ persist: true }), true);
  assert.equal(offer.reminders.expiresSoonAt, NOW);
  assert.deepEqual(harness.notifications, [[
    ['u-traveler'],
    { key: 'offer.expiring', params: { title: 'Diplome' } },
    null,
    'reminders',
    'matching',
  ]]);
  assert.deepEqual(harness.events, [
    'normalize:all',
    'normalize:o-1',
    'notify:start',
    'notify:done',
    'save',
  ]);
  assert.equal(harness.saveCalls, 1);
});

test('matching offer reminder job notifie l expediteur apres une contre-proposition', async () => {
  const offer = {
    id: 'o-2',
    listingId: 'l-2',
    senderId: 'u-sender',
    travelerId: 'u-traveler',
    status: 'countered_sender',
    expiresAt: NOW + 1_000,
    reminders: {},
  };
  const harness = createJob({
    matchingOffers: [offer],
    listings: [{ id: 'l-2', title: 'Colis' }],
  });

  assert.equal(await harness.job(), true);
  assert.deepEqual(harness.notifications[0][0], ['u-sender']);
  assert.equal(harness.saveCalls, 0);
});

test('matching offer reminder job notifie les deux parties apres expiration', async () => {
  const offer = {
    id: 'o-3',
    listingId: 'missing',
    senderId: 'u-sender',
    travelerId: 'u-traveler',
    status: 'expired',
  };
  const harness = createJob({ matchingOffers: [offer] });

  assert.equal(await harness.job(), true);
  assert.equal(offer.reminders.expiredAt, NOW);
  assert.deepEqual(harness.notifications, [[
    ['u-sender', 'u-traveler'],
    { key: 'offer.expired', params: { title: 'une proposition' } },
    null,
    'reminders',
    'matching',
  ]]);
  assert.equal(harness.saveCalls, 0);
});

test('matching offer reminder job reste idempotent pour un rappel deja envoye', async () => {
  const offer = {
    id: 'o-4',
    listingId: 'l-4',
    senderId: 'u-sender',
    travelerId: 'u-traveler',
    status: 'pending_traveler',
    expiresAt: NOW + 1_000,
    reminders: { expiresSoonAt: NOW - 1_000 },
  };
  const harness = createJob({ matchingOffers: [offer] });

  assert.equal(await harness.job({ persist: true }), false);
  assert.deepEqual(harness.notifications, []);
  assert.equal(harness.saveCalls, 0);
});

test('matching offer reminder job persiste une normalisation sans notification', async () => {
  const harness = createJob({ normalizedChanged: true });

  assert.equal(await harness.job({ persist: true }), true);
  assert.deepEqual(harness.notifications, []);
  assert.equal(harness.saveCalls, 1);
  assert.deepEqual(harness.events, ['normalize:all', 'save']);
});
