import test from 'node:test';
import assert from 'node:assert/strict';
import {
  listRelationalTrips, relationalTripReadsEnabled, relationalUserFromSession,
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
    query: { from: 'Oujda', to: 'Bruxelles', q: 'valise', limit: 999, offset: -4 },
    today: '2026-07-17',
  });
  assert.equal(result.trips[0].saved, true);
  assert.equal(result.trips[0].traveler.name, 'Karim');
  assert.equal(result.page.limit, 100);
  assert.equal(result.page.offset, 0);
  assert.match(calls[0].sql, /wigofly_trips/);
  assert.match(calls[0].sql, /wigofly_users/);
  assert.match(calls[0].sql, /wigofly_saved_trips/);
  assert.ok(calls[0].params.includes('%Oujda%'));
  assert.ok(calls[0].params.includes('%valise%'));
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
