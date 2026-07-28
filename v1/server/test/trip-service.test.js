import assert from 'node:assert/strict';
import test from 'node:test';
import { createTripService } from '../services/trips.js';

function createHarness(overrides = {}) {
  const events = [];
  let sequence = 0;
  const users = [
    { id: 'u-1', name: 'Membre 1', kycStatus: 'verified' },
    { id: 'u-2', name: 'Membre 2', kycStatus: 'verified' },
  ];
  const db = {
    trips: [
      {
        id: 't-own',
        travelerId: 'u-1',
        from: 'Oujda',
        to: 'Bruxelles',
        date: '2026-08-10',
        departureDate: '2026-08-10',
        transportMode: 'plane',
        price: 25,
        capacityKg: 6,
        status: 'published',
        createdAt: 200,
      },
      {
        id: 't-other',
        travelerId: 'u-2',
        from: 'Paris',
        to: 'Bruxelles',
        date: '2026-08-12',
        departureDate: '2026-08-12',
        transportMode: 'car',
        price: 20,
        capacityKg: 4,
        status: 'published',
        createdAt: 100,
      },
    ],
    transactions: [],
    savedTrips: [
      {
        id: 'saved-1',
        userId: 'u-1',
        tripId: 't-other',
        createdAt: 300,
      },
    ],
  };
  const tripView = (trip, user) => ({
    ...trip,
    departureDate: trip.departureDate || trip.date,
    status: trip.status || 'published',
    saved: db.savedTrips.some((saved) =>
      saved.userId === user?.id
      && saved.tripId === trip.id
    ),
  });
  const dependencies = {
    db,
    isClosedStatus: (status) => ['released', 'refunded', 'cancelled'].includes(status),
    transportModes: new Set(['plane', 'car']),
    normalizeTransportMode: (value) => value === 'car' ? 'car' : 'plane',
    tripView,
    availableTrips(user, query) {
      return db.trips
        .filter((trip) => trip.status === 'published')
        .filter((trip) => query.excludeMine !== '1' || trip.travelerId !== user.id)
        .map((trip) => tripView(trip, user));
    },
    cleanupSavedTrips() {
      const before = db.savedTrips.length;
      db.savedTrips = db.savedTrips.filter((saved) =>
        db.trips.some((trip) =>
          trip.id === saved.tripId
          && trip.status === 'published'
          && trip.departureDate >= '2026-07-25'
        )
      );
      return before !== db.savedTrips.length;
    },
    positiveNumber(value) {
      const number = Number(value);
      return Number.isFinite(number) && number > 0 ? number : null;
    },
    async auditChange(payload) {
      events.push(['audit', payload]);
    },
    save() {
      events.push(['save']);
    },
    newId(prefix) {
      sequence += 1;
      return `${prefix}-${sequence}`;
    },
    today: () => '2026-07-25',
    ...overrides,
  };
  return {
    db,
    events,
    service: createTripService(dependencies),
    users,
  };
}

test('trip service liste mes trajets avec le nombre d operations actives', () => {
  const { db, service, users } = createHarness();
  db.transactions.push(
    { id: 'tx-open', tripId: 't-own', status: 'accepted' },
    { id: 'tx-closed', tripId: 't-own', status: 'released' },
  );

  const result = service.mine(users[0]);

  assert.equal(result.trips.length, 1);
  assert.equal(result.trips[0].activeOperations, 1);
});

test('trip service exige KYC et valide le formulaire avant creation', async () => {
  const { db, events, service, users } = createHarness();
  const unverified = {
    ...users[0],
    kycStatus: 'pending',
  };
  assert.equal(
    (await service.create(unverified, {
      from: 'Oujda',
      to: 'Bruxelles',
      date: '2026-08-20',
    })).status,
    403,
  );
  assert.equal(
    (await service.create(users[0], {
      from: 'Oujda',
      to: 'Oujda',
      date: '2026-08-20',
    })).body.error,
    'Départ et arrivée identiques',
  );
  assert.equal(
    (await service.create(users[0], {
      from: 'Oujda',
      to: 'Bruxelles',
      date: '2026-08-20',
      transportMode: 'train',
    })).body.error,
    'Type de transport invalide',
  );
  assert.equal(db.trips.length, 2);
  assert.deepEqual(events, []);
});

test('trip service cree, audite puis sauvegarde un trajet normalise', async () => {
  const { db, events, service, users } = createHarness();
  const result = await service.create(users[0], {
    from: ' Oujda ',
    to: ' Bruxelles ',
    date: '2026-08-20',
    transportMode: 'car',
    price: 30,
    capacityKg: 50,
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.trip.from, 'Oujda');
  assert.equal(result.body.trip.capacityKg, 30);
  assert.equal(result.body.trip.transportMode, 'car');
  assert.equal(db.trips.length, 3);
  assert.deepEqual(events.map(([type]) => type), ['audit', 'save']);
  assert.equal(events[0][1].action, 'trip.create');
});

test('trip service bloque modification et retrait pendant une operation active', async () => {
  const { db, events, service, users } = createHarness();
  db.transactions.push({
    id: 'tx-open',
    tripId: 't-own',
    status: 'accepted',
  });

  assert.equal(
    (await service.update('t-own', users[0], {
      price: 35,
    })).body.error,
    'Impossible de modifier un trajet avec operation en cours',
  );
  assert.equal(
    (await service.remove('t-own', users[0])).body.error,
    'Impossible de retirer un trajet avec operation en cours',
  );
  assert.deepEqual(events, []);
});

test('trip service modifie puis retire avec historique avant apres', async () => {
  const { db, events, service, users } = createHarness();

  const updated = await service.update('t-own', users[0], {
    to: 'Paris',
    price: 35,
    transportMode: 'car',
  });
  assert.equal(updated.status, 200);
  assert.equal(db.trips[0].to, 'Paris');
  assert.equal(events[0][1].before.to, 'Bruxelles');
  assert.equal(events[0][1].after.to, 'Paris');

  const removed = await service.remove('t-own', users[0]);
  assert.equal(removed.status, 200);
  assert.equal(db.trips[0].status, 'removed');
  assert.equal(db.savedTrips.some(({ tripId }) => tripId === 't-own'), false);
  assert.deepEqual(events.map(([type]) => type), [
    'audit',
    'save',
    'audit',
    'save',
  ]);
});

test('trip service sert feed, apercu et detail disponible', () => {
  const { service, users } = createHarness();

  assert.equal(service.list(users[0], {}).trips.length, 2);
  const overview = service.overview(users[0], {});
  assert.deepEqual(overview.trips.map(({ id }) => id), ['t-other']);
  assert.deepEqual(overview.myTrips.map(({ id }) => id), ['t-own']);
  assert.equal(service.detail('t-own', users[0]).body.trip.activeOperations, 0);
  assert.equal(service.detail('missing', users[0]).status, 404);
});

test('trip service nettoie, ajoute idempotemment et retire les favoris', () => {
  const { db, events, service, users } = createHarness();
  db.trips.push({
    id: 't-expired',
    travelerId: 'u-2',
    date: '2026-01-01',
    departureDate: '2026-01-01',
    status: 'published',
  });
  db.savedTrips.push({
    id: 'saved-expired',
    userId: 'u-1',
    tripId: 't-expired',
    createdAt: 100,
  });

  assert.deepEqual(
    service.saved(users[0]).trips.map(({ id }) => id),
    ['t-other'],
  );
  assert.deepEqual(events, [['save']]);

  service.saveTrip('t-other', users[0]);
  assert.equal(
    db.savedTrips.filter(({ tripId }) => tripId === 't-other').length,
    1,
  );
  service.unsaveTrip('t-other', users[0]);
  assert.equal(db.savedTrips.length, 0);
});
