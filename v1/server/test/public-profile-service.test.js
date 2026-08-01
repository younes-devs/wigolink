import assert from 'node:assert/strict';
import test from 'node:test';
import { createPublicProfileService } from '../services/public-profiles.js';

function createHarness({
  users = [],
  trips = [],
  transactions = [],
  leak = false,
} = {}) {
  let saves = 0;
  const events = [];
  const db = { users, trips, transactions };
  const service = createPublicProfileService({
    db,
    findUser: (id) => users.find((user) => user.id === id),
    publicUser: (user) => user && ({
      id: user.id,
      name: user.name,
      rating: user.rating,
    }),
    normalizeTransportMode: (value) =>
      value === 'car' ? 'car' : 'plane',
    detectLeak: () => leak,
    addEvent(transaction, type, actorId, meta) {
      events.push({ transaction: transaction.id, type, actorId, meta });
    },
    save() {
      saves += 1;
    },
    now: () => 500,
  });
  return {
    service,
    events,
    saves: () => saves,
  };
}

function transaction(overrides = {}) {
  return {
    id: 'tx-1',
    senderId: 'sender',
    travelerId: 'traveler',
    recipientId: 'sender',
    status: 'released',
    ratings: [],
    ...overrides,
  };
}

test('profil public expose quatre trajets publiés triés', () => {
  const users = [{
    id: 'traveler',
    name: 'Voyageur',
    completed: 4,
    rating: 4.8,
    ratingCount: 3,
    cancelRate: 0.1,
  }];
  const trips = [
    {
      id: 'hidden',
      travelerId: 'traveler',
      status: 'withdrawn',
      departureDate: '2026-01-01',
    },
    ...['05', '01', '04', '03', '02'].map((day) => ({
      id: `trip-${day}`,
      travelerId: 'traveler',
      status: 'published',
      departureDate: `2026-08-${day}`,
      from: 'Bruxelles',
      to: 'Casablanca',
      transportMode: day === '01' ? 'car' : 'unknown',
      price: 20,
      capacityKg: 5,
    })),
  ];
  const { service } = createHarness({ users, trips });

  const result = service.profile('traveler');

  assert.equal(result.status, 200);
  assert.deepEqual(
    result.body.trips.map((trip) => trip.id),
    ['trip-01', 'trip-02', 'trip-03', 'trip-04'],
  );
  assert.equal(result.body.trips[0].transportMode, 'car');
  assert.equal(result.body.trips[1].transportMode, 'plane');
  assert.deepEqual(result.body.stats, {
    completed: 4,
    rating: 4.8,
    ratingCount: 3,
    cancelRate: 0.1,
  });
  assert.equal(service.profile('missing').status, 404);
});

test('avis reçus sont triés et restent lisibles si auteur absent', () => {
  const users = [
    {
      id: 'traveler',
      rating: 4.5,
      ratingCount: 2,
    },
    {
      id: 'sender',
      name: 'Alice',
    },
  ];
  const transactions = [
    transaction({
      id: 'tx-old',
      ratings: [{
        by: 'sender',
        target: 'traveler',
        stars: 4,
        comment: 'Bien',
        at: 100,
      }],
    }),
    transaction({
      id: 'tx-new',
      ratings: [{
        by: 'deleted-author',
        target: 'traveler',
        stars: 5,
        at: 200,
      }],
    }),
  ];
  const { service } = createHarness({ users, transactions });

  const result = service.reviews('traveler');

  assert.equal(result.status, 200);
  assert.deepEqual(
    result.body.reviews.map((review) => review.authorName),
    ['Membre Wigolink', 'Alice'],
  );
  assert.equal(result.body.rating, 4.5);
  assert.equal(service.reviews('missing').status, 404);
});

test('notation exige une transaction livrée et deux participants distincts', () => {
  const users = [
    { id: 'sender', rating: 0, ratingCount: 0 },
    { id: 'traveler', rating: 0, ratingCount: 0 },
    { id: 'outsider', rating: 0, ratingCount: 0 },
  ];
  const transactions = [transaction()];
  const { service, saves } = createHarness({ users, transactions });

  assert.equal(
    service.rate('missing', users[0], {
      targetId: 'traveler',
      stars: 5,
    }).status,
    400,
  );
  assert.equal(
    service.rate('tx-1', users[2], {
      targetId: 'traveler',
      stars: 5,
    }).status,
    403,
  );
  assert.equal(
    service.rate('tx-1', users[0], {
      targetId: 'sender',
      stars: 5,
    }).status,
    400,
  );
  assert.equal(saves(), 0);
});

test('notation valide met à jour moyenne, audit et sauvegarde', () => {
  const users = [
    { id: 'sender', rating: 0, ratingCount: 0 },
    { id: 'traveler', rating: 4, ratingCount: 2 },
  ];
  const transactions = [transaction()];
  const { service, events, saves } = createHarness({
    users,
    transactions,
  });

  const result = service.rate('tx-1', users[0], {
    targetId: 'traveler',
    stars: 5,
    comment: '  Très fiable  ',
  });

  assert.equal(result.status, 200);
  assert.deepEqual(transactions[0].ratings[0], {
    by: 'sender',
    target: 'traveler',
    stars: 5,
    comment: 'Très fiable',
    at: 500,
  });
  assert.equal(users[1].ratingCount, 3);
  assert.equal(users[1].rating, 4.3);
  assert.deepEqual(events, [{
    transaction: 'tx-1',
    type: 'rated',
    actorId: 'sender',
    meta: { target: 'traveler', stars: 5 },
  }]);
  assert.equal(saves(), 1);
  assert.equal(
    service.rate('tx-1', users[0], {
      targetId: 'traveler',
      stars: 5,
    }).body.error,
    'Déjà noté',
  );
});

test('notation refuse notes invalides et coordonnées publiques', () => {
  const users = [
    { id: 'sender' },
    { id: 'traveler' },
  ];
  const transactions = [transaction()];
  const invalid = createHarness({ users, transactions });
  const leaking = createHarness({
    users,
    transactions: [transaction()],
    leak: true,
  });

  assert.equal(
    invalid.service.rate('tx-1', users[0], {
      targetId: 'traveler',
      stars: 6,
    }).status,
    400,
  );
  assert.equal(
    leaking.service.rate('tx-1', users[0], {
      targetId: 'traveler',
      stars: 5,
      comment: '0612345678',
    }).status,
    400,
  );
});
