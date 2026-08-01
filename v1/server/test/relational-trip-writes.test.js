import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createRelationalTripWriter,
  relationalTripMutationsEnabled,
  relationalTripWritesEnabled,
} from '../relational-trip-writes.js';

function createHarness({ tripStatus = 200 } = {}) {
  const queries = [];
  let sequence = 0;
  const writer = createRelationalTripWriter({
    getPool: () => ({
      async query(sql, params) {
        queries.push({ sql, params });
        return { rows: [], rowCount: 1 };
      },
    }),
    getTrip: async () => tripStatus === 200
      ? {
        status: 200,
        body: {
          trip: {
            id: 't-1',
            from: 'Oujda',
            to: 'Bruxelles',
            saved: false,
          },
        },
      }
      : {
        status: 404,
        body: {
          error: tripStatus === 404
            ? 'Trajet introuvable'
            : 'Trajet expire ou indisponible',
        },
      },
    newId(prefix) {
      sequence += 1;
      return `${prefix}-${sequence}`;
    },
    today: () => '2026-07-29',
    now: () => 1_000,
    logger: { error() {} },
  });
  return { queries, writer };
}

test('favoris relationnels : option inactive par defaut', () => {
  assert.equal(relationalTripWritesEnabled({}), false);
  assert.equal(
    relationalTripWritesEnabled({ RELATIONAL_TRIP_WRITES: 'true' }),
    true,
  );
  assert.equal(relationalTripMutationsEnabled({}), false);
  assert.equal(relationalTripMutationsEnabled({
    RELATIONAL_TRIP_MUTATIONS: 'true',
  }), true);
});

test('mutations trajets relationnelles : creation utilise un id distribue et SQL direct', async () => {
  const queries = [];
  const audits = [];
  let createdTrip;
  const pool = {
    async query(sql, params) {
      queries.push({ sql, params });
      if (String(sql).includes('insert into public.wigolink_trips')) {
        createdTrip = JSON.parse(params[1]);
      }
      return { rows: [] };
    },
  };
  const writer = createRelationalTripWriter({
    getPool: () => pool,
    async getTrip() {
      return { status: 200, body: { trip: createdTrip } };
    },
    today: () => '2026-07-29',
    canonicalizeLocation: (value) => ({
      id: null,
      countryCode: 'MA',
      name: String(value),
      latitude: null,
      longitude: null,
    }),
    async auditChange(payload) {
      audits.push(payload);
    },
    now: () => Date.UTC(2026, 6, 29),
    logger: { error() {} },
  });
  const result = await writer.create({
    user: { id: 'u-1', kycStatus: 'verified' },
    body: {
      from: 'Oujda',
      to: 'Bruxelles',
      date: '2026-08-10',
      capacityKg: 6,
      price: 30,
    },
  });

  assert.equal(result.status, 200);
  assert.match(result.body.trip.id, /^t-[0-9a-f-]{36}$/);
  assert.match(queries[0].sql, /insert into public.wigolink_trips/);
  assert.equal(audits[0].action, 'trip.create');
});

test('mutations trajets relationnelles : modification verrouille et refuse une operation active', async () => {
  const queries = [];
  const client = {
    async query(sql, params = []) {
      queries.push({ sql: String(sql), params });
      if (String(sql).includes('select data from public.wigolink_trips')) {
        return {
          rows: [{
            data: {
              id: 't-1',
              travelerId: 'u-1',
              status: 'published',
              from: 'Oujda',
              to: 'Bruxelles',
              departureDate: '2026-08-10',
              price: 30,
              capacityKg: 6,
            },
          }],
        };
      }
      if (String(sql).includes('select count(*)')) {
        return { rows: [{ count: 1 }] };
      }
      return { rows: [] };
    },
    release() {},
  };
  const writer = createRelationalTripWriter({
    getPool: () => ({ connect: async () => client }),
    getTrip: async () => ({ status: 404, body: {} }),
    today: () => '2026-07-29',
    now: () => Date.UTC(2026, 6, 29),
    logger: { error() {} },
  });
  const result = await writer.update({
    user: { id: 'u-1' },
    tripId: 't-1',
    body: { price: 40 },
  });

  assert.equal(result.status, 400);
  assert.match(result.body.error, /operation en cours/);
  assert.ok(queries.some(({ sql }) => (
    sql.includes('wigolink_trips') && sql.includes('for update')
  )));
  assert.equal(
    queries.some(({ sql }) => sql.includes('update public.wigolink_trips')),
    false,
  );
});

test('favoris relationnels : ajout idempotent retourne le trajet sauvegarde', async () => {
  const harness = createHarness();
  const result = await harness.writer.saveTrip({
    user: { id: 'u-1' },
    tripId: 't-1',
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.trip.saved, true);
  assert.match(harness.queries[0].sql, /on conflict do nothing/);
  assert.equal(harness.queries[0].params[0], 'saved-1');
});

test('favoris relationnels : retrait est borne au membre et au trajet', async () => {
  const harness = createHarness();
  const result = await harness.writer.unsaveTrip({
    user: { id: 'u-1' },
    tripId: 't-1',
  });

  assert.equal(result.status, 200);
  assert.deepEqual(harness.queries[0].params, ['u-1', 't-1']);
  assert.match(harness.queries[0].sql, /delete from public.wigolink_saved_trips/);
});

test('favoris relationnels : trajet absent conserve le statut 404', async () => {
  const harness = createHarness({ tripStatus: 404 });
  const result = await harness.writer.saveTrip({
    user: { id: 'u-1' },
    tripId: 'missing',
  });

  assert.equal(result.status, 404);
  assert.equal(harness.queries.length, 0);
});
