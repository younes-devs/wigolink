import test from 'node:test';
import assert from 'node:assert/strict';
import {
  listRelationalSavedTrips, listRelationalTrips, relationalTrip,
  relationalTripReadsEnabled, relationalUserFromSession,
  snapshotRelationalTripState, syncRelationalTripState,
} from '../relational-trip-feed.js';

test('feed relationnel : l option est inactive par defaut', () => {
  assert.equal(relationalTripReadsEnabled({}), false);
  assert.equal(relationalTripReadsEnabled({ RELATIONAL_TRIP_READS: 'true' }), true);
});

test('feed relationnel : authentifie la session depuis la table utilisateurs', async () => {
  const calls = [];
  const user = await relationalUserFromSession({
    token: 'secret',
    getSession: async (token) => ({ userId: token === 'secret' ? 'u-1' : null }),
    pool: { query(sql, params) { calls.push({ sql, params }); return { rows: [{ data: { id: 'u-1', emailVerified: true } }] }; } },
  });
  assert.equal(user.id, 'u-1');
  assert.match(calls[0].sql, /wigofly_users/);
  assert.deepEqual(calls[0].params, ['u-1']);
});

test('feed relationnel : utilise filtres indexes et pagination bornee', async () => {
  const calls = [];
  const result = await listRelationalTrips({
    pool: {
      query(sql, params) {
        calls.push({ sql, params });
        return { rows: [{
          trip: { id: 't-1', travelerId: 'u-2', from: 'Oujda', to: 'Bruxelles', date: '2026-08-01', capacityKg: 6, price: 25 },
          traveler: { id: 'u-2', name: 'Karim', kycStatus: 'verified', emailVerified: true }, saved: true,
        }] };
      },
    },
    user: { id: 'u-1' },
    query: { from: 'wjda', to: 'Bruxelles', q: 'valise', limit: 999, offset: -4 },
    today: '2026-07-17',
  });
  assert.equal(result.trips[0].saved, true);
  assert.equal(result.trips[0].traveler.name, 'Karim');
  assert.equal(result.trips[0].transportMode, 'plane');
  assert.equal(result.page.limit, 100);
  assert.equal(result.page.offset, 0);
  assert.match(calls[0].sql, /wigofly_trips/);
  assert.match(calls[0].sql, /wigofly_users/);
  assert.match(calls[0].sql, /wigofly_saved_trips/);
  const searchTerms = calls[0].params.flatMap((param) => (Array.isArray(param) ? param : []));
  assert.ok(searchTerms.includes('%Oujda%'));
  assert.ok(searchTerms.includes('%wjda%'));
  assert.ok(searchTerms.includes('%valise%'));
  assert.match(calls[0].sql, /fromLocationId/);
  assert.ok(calls[0].params.includes('ma-2540483'));
});

test('feed relationnel : detail charge trajet, favori et operations sans document global', async () => {
  const calls = [];
  const result = await relationalTrip({
    pool: {
      query(sql, params) {
        calls.push({ sql, params });
        return {
          rows: [{
            trip: {
              id: 't-1',
              travelerId: 'u-1',
              from: 'Oujda',
              to: 'Bruxelles',
              date: '2026-08-01',
              status: 'published',
            },
            traveler: {
              id: 'u-1',
              name: 'Younes',
              kycStatus: 'verified',
            },
            saved: true,
            active_operations: 2,
          }],
        };
      },
    },
    user: { id: 'u-1' },
    id: 't-1',
    today: '2026-07-29',
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.trip.saved, true);
  assert.equal(result.body.trip.activeOperations, 2);
  assert.match(calls[0].sql, /wigofly_transactions/);
  assert.deepEqual(calls[0].params, ['u-1', 't-1']);
});

test('feed relationnel : detail masque un trajet expire', async () => {
  const result = await relationalTrip({
    pool: {
      query() {
        return {
          rows: [{
            trip: {
              id: 't-old',
              travelerId: 'u-2',
              from: 'Oujda',
              to: 'Paris',
              date: '2026-01-01',
              status: 'published',
            },
            traveler: { id: 'u-2', name: 'Karim' },
            saved: false,
            active_operations: 0,
          }],
        };
      },
    },
    user: { id: 'u-1' },
    id: 't-old',
    today: '2026-07-29',
  });

  assert.equal(result.status, 404);
});

test('feed relationnel : favoris supprime les expires puis retourne une page', async () => {
  const calls = [];
  const result = await listRelationalSavedTrips({
    pool: {
      query(sql, params) {
        calls.push({ sql, params });
        if (calls.length === 1) return { rows: [], rowCount: 1 };
        return {
          rows: [{
            trip: {
              id: 't-1',
              travelerId: 'u-2',
              from: 'Oujda',
              to: 'Bruxelles',
              date: '2026-08-01',
              status: 'published',
            },
            traveler: { id: 'u-2', name: 'Karim' },
            saved: true,
          }],
        };
      },
    },
    user: { id: 'u-1' },
    today: '2026-07-29',
    query: { limit: 20 },
  });

  assert.equal(result.trips[0].saved, true);
  assert.match(calls[0].sql, /delete from public.wigofly_saved_trips/);
  assert.match(calls[1].sql, /order by saved_trip.created_at desc/);
  assert.deepEqual(calls[1].params, ['u-1', '2026-07-29', 21, 0]);
});

test('feed relationnel : ne synchronise que les ecritures changees', async () => {
  const before = snapshotRelationalTripState({
    users: [{ id: 'u-1', name: 'A' }], trips: [{ id: 't-1', price: 20 }], savedTrips: [], transactions: [],
  });
  const queries = [];
  await syncRelationalTripState({
    pool: { query(sql, params) { queries.push({ sql, params }); return Promise.resolve({}); } },
    before,
    after: {
      users: [{ id: 'u-1', name: 'A' }], trips: [{ id: 't-1', price: 25 }],
      savedTrips: [{ id: 's-1', userId: 'u-1', tripId: 't-1' }], transactions: [],
    },
  });
  assert.equal(queries.length, 2);
  assert.ok(queries.every(({ sql }) => sql.includes('insert into public.wigofly_')));
  assert.ok(queries.some(({ sql }) => sql.includes('wigofly_trips')));
  assert.ok(queries.some(({ sql }) => sql.includes('wigofly_saved_trips')));
});

test('feed relationnel : synchronise aussi les messages de conversation modifies', async () => {
  const before = snapshotRelationalTripState({
    users: [], trips: [], savedTrips: [], transactions: [],
    conversations: [{ id: 'conv-1', participantIds: ['u-1', 'u-2'] }],
    messages: [{ id: 'm-1', conversationId: 'conv-1', from: 'u-1', text: 'Avant', at: 1 }],
  });
  const queries = [];
  await syncRelationalTripState({
    pool: { query(sql, params) { queries.push({ sql, params }); return Promise.resolve({}); } },
    before,
    after: {
      users: [], trips: [], savedTrips: [], transactions: [],
      conversations: [{ id: 'conv-1', participantIds: ['u-1', 'u-2'], pinnedBy: ['u-1'] }],
      messages: [{ id: 'm-1', conversationId: 'conv-1', from: 'u-1', text: 'Apres', at: 2 }],
    },
  });
  assert.ok(queries.some(({ sql }) => sql.includes('wigofly_conversations')));
  assert.ok(queries.some(({ sql }) => sql.includes('insert into public.messages')));
});
