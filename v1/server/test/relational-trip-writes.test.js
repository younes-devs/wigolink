import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createRelationalTripWriter,
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
  assert.match(harness.queries[0].sql, /delete from public.wigofly_saved_trips/);
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
