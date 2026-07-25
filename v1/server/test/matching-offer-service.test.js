import assert from 'node:assert/strict';
import test from 'node:test';
import { createMatchingOfferService } from '../services/matching-offers.js';

const NOW = Date.parse('2026-07-25T12:00:00.000Z');

function createHarness({
  listings = [],
  trips = [],
  users = [],
  offers = [],
} = {}) {
  const events = [];
  const db = {
    listings,
    trips,
    users,
    matchingOffers: offers,
  };
  const service = createMatchingOfferService({
    db,
    matchesTrip(listing, trip) {
      return (
        listing.from === trip.from
        && listing.to === trip.to
        && listing.weightKg <= trip.capacityKg
      );
    },
    publicUser(user) {
      return user ? { id: user.id, name: user.name } : null;
    },
    findUser(id) {
      return db.users.find((user) => user.id === id);
    },
    positiveNumber(value) {
      const number = Number(value);
      return Number.isFinite(number) && number > 0 ? number : null;
    },
    async notify(...args) {
      events.push(['notify', ...args]);
    },
    save() {
      events.push(['save']);
    },
    newId(prefix) {
      return `${prefix}-new`;
    },
    async runReminders(options) {
      events.push(['reminders', options]);
    },
    now() {
      return NOW;
    },
  });
  return { db, service, events };
}

function listing(overrides = {}) {
  return {
    id: 'l-1',
    senderId: 'u-sender',
    status: 'published',
    title: 'Diplôme',
    from: 'Oujda',
    to: 'Bruxelles',
    weightKg: 1,
    travelerPay: 15,
    createdAt: NOW - 1000,
    ...overrides,
  };
}

function trip(overrides = {}) {
  return {
    id: 't-1',
    travelerId: 'u-traveler',
    from: 'Oujda',
    to: 'Bruxelles',
    capacityKg: 5,
    date: '2026-08-01',
    createdAt: NOW - 1000,
    ...overrides,
  };
}

function offer(overrides = {}) {
  return {
    id: 'mo-1',
    listingId: 'l-1',
    tripId: 't-1',
    senderId: 'u-sender',
    travelerId: 'u-traveler',
    status: 'pending_traveler',
    offeredPay: 15,
    message: 'Possible ?',
    history: [],
    createdAt: NOW - 1000,
    expiresAt: NOW + 3600e3,
    respondedAt: null,
    txId: null,
    ...overrides,
  };
}

test('matching service normalise une offre historique et son expiration', () => {
  const legacy = offer({
    status: 'pending',
    offeredPay: 0,
    history: null,
    expiresAt: NOW,
  });
  const { service } = createHarness({
    listings: [listing()],
    offers: [legacy],
  });

  service.normalize(legacy);

  assert.equal(legacy.status, 'expired');
  assert.equal(legacy.offeredPay, 15);
  assert.equal(legacy.respondedAt, NOW);
  assert.deepEqual(legacy.history.map((event) => event.type), [
    'created',
    'expired',
  ]);
});

test('matching service sauvegarde une normalisation une seule fois', () => {
  const legacy = offer({ status: 'pending', history: null });
  const { service, events } = createHarness({
    listings: [listing()],
    offers: [legacy],
  });

  assert.equal(service.normalizeAll({ persist: true }), true);
  assert.equal(service.normalizeAll({ persist: true }), false);
  assert.deepEqual(events, [['save']]);
});

test('matching center score et priorise les trajets compatibles', async () => {
  const { service, events } = createHarness({
    listings: [listing()],
    trips: [
      trip(),
      trip({
        id: 't-2',
        travelerId: 'u-other',
        capacityKg: 0.5,
      }),
    ],
    users: [
      { id: 'u-traveler', name: 'Traveler', completed: 4 },
      { id: 'u-other', name: 'Other', completed: 8 },
    ],
  });

  const result = await service.center({
    id: 'u-sender',
  });

  assert.deepEqual(events, [['reminders', { persist: true }]]);
  assert.equal(result.matching.totals.listings, 1);
  assert.equal(result.matching.totals.matched, 1);
  assert.equal(result.matching.totals.candidates, 1);
  assert.equal(result.matching.items[0].candidateCount, 1);
  assert.equal(result.matching.items[0].action.id, 'contact_ready');
  assert.deepEqual(
    result.matching.items[0].candidates[0].traveler,
    { id: 'u-traveler', name: 'Traveler' },
  );
});

test('matching list est limitée au membre et enrichit les relations', async () => {
  const own = offer();
  const foreign = offer({
    id: 'mo-2',
    senderId: 'u-a',
    travelerId: 'u-b',
  });
  const { service } = createHarness({
    listings: [listing()],
    trips: [trip()],
    users: [
      { id: 'u-sender', name: 'Sender' },
      { id: 'u-traveler', name: 'Traveler' },
    ],
    offers: [foreign, own],
  });

  const result = await service.list({ id: 'u-traveler' });

  assert.deepEqual(result.offers.map((item) => item.id), ['mo-1']);
  assert.equal(result.offers[0].myRole, 'traveler');
  assert.equal(result.offers[0].listing.id, 'l-1');
  assert.equal(result.offers[0].trip.id, 't-1');
  assert.deepEqual(result.offers[0].sender, {
    id: 'u-sender',
    name: 'Sender',
  });
});

test('matching create refuse les ressources et contraintes invalides', async () => {
  const { service, db, events } = createHarness({
    listings: [listing()],
    trips: [trip()],
  });

  assert.equal(
    (await service.create(
      { id: 'u-other' },
      { listingId: 'l-1', tripId: 't-1' },
    )).status,
    404,
  );
  assert.equal(
    (await service.create(
      { id: 'u-sender' },
      { listingId: 'l-1', tripId: 'missing' },
    )).body.error,
    'Trajet incompatible',
  );
  assert.equal(
    (await service.create(
      { id: 'u-sender' },
      { listingId: 'l-1', tripId: 't-1', offeredPay: 0 },
    )).body.error,
    'Montant proposé invalide',
  );
  assert.equal(db.matchingOffers.length, 0);
  assert.deepEqual(events, []);
});

test('matching create notifie, sauvegarde et reste idempotent', async () => {
  const { service, db, events } = createHarness({
    listings: [listing()],
    trips: [trip()],
  });
  const user = { id: 'u-sender', name: 'Sender' };
  const body = {
    listingId: 'l-1',
    tripId: 't-1',
    offeredPay: 12,
    message: '  Disponible ?  ',
    expiresInHours: 24,
  };

  const first = await service.create(user, body);
  const second = await service.create(user, body);

  assert.equal(first.status, 200);
  assert.equal(first.body.offer.message, 'Disponible ?');
  assert.equal(first.body.offer.expiresAt, NOW + 24 * 36e5);
  assert.equal(second.body.offer.id, first.body.offer.id);
  assert.equal(db.matchingOffers.length, 1);
  assert.deepEqual(events.map(([type]) => type), ['notify', 'save']);
  assert.deepEqual(events[0].slice(1), [
    ['u-traveler'],
    {
      key: 'offer.received',
      params: { name: 'Sender', title: 'Diplôme' },
    },
    null,
    'messages',
    'matching',
  ]);
});

test('matching decline exige un participant et ferme offre active', async () => {
  const current = offer();
  const { service, events } = createHarness({
    listings: [listing()],
    offers: [current],
  });

  assert.equal(
    (await service.decline('mo-1', { id: 'u-other' })).status,
    404,
  );
  const result = await service.decline('mo-1', {
    id: 'u-traveler',
    name: 'Traveler',
  });

  assert.equal(result.body.offer.status, 'declined');
  assert.equal(result.body.offer.respondedAt, NOW);
  assert.equal(result.body.offer.history.at(-1).type, 'declined');
  assert.deepEqual(events.map(([type]) => type), ['notify', 'save']);
});

test('matching withdraw est réservé à expéditeur', async () => {
  const current = offer();
  const { service } = createHarness({
    listings: [listing()],
    offers: [current],
  });

  assert.equal(
    (await service.withdraw('mo-1', { id: 'u-traveler' })).status,
    404,
  );
  const result = await service.withdraw('mo-1', {
    id: 'u-sender',
    name: 'Sender',
  });
  assert.equal(result.body.offer.status, 'withdrawn');
});

test('matching counter alterne le tour et renouvelle expiration', async () => {
  const current = offer();
  const { service } = createHarness({
    listings: [listing()],
    offers: [current],
  });

  const travelerResult = await service.counter(
    'mo-1',
    { id: 'u-traveler', name: 'Traveler' },
    { offeredPay: 18, message: '  Dix-huit  ' },
  );
  assert.equal(travelerResult.body.offer.status, 'countered_sender');
  assert.equal(travelerResult.body.offer.offeredPay, 18);
  assert.equal(travelerResult.body.offer.message, 'Dix-huit');
  assert.equal(travelerResult.body.offer.expiresAt, NOW + 72 * 36e5);

  const senderResult = await service.counter(
    'mo-1',
    { id: 'u-sender', name: 'Sender' },
    { offeredPay: 16 },
  );
  assert.equal(senderResult.body.offer.status, 'pending_traveler');
  assert.equal(senderResult.body.offer.history.length, 2);
});
