import test from 'node:test';
import assert from 'node:assert/strict';
import {
  rateRelationalOperation,
  relationalPublicProfile,
  relationalPublicProfileReadsEnabled,
  relationalPublicReviews,
} from '../relational-public-profiles.js';

test('profils relationnels suivent les drapeaux trajets et operations', () => {
  assert.equal(relationalPublicProfileReadsEnabled({}), false);
  assert.equal(relationalPublicProfileReadsEnabled({
    RELATIONAL_TRIP_READS: 'true',
  }), true);
});

test('profil public relationnel borne les prochains trajets', async () => {
  const result = await relationalPublicProfile({
    pool: {
      async query(sql, params) {
        assert.match(sql, /limit 4/);
        assert.deepEqual(params, ['u-1']);
        return {
          rows: [{
            user: {
              id: 'u-1',
              name: 'Younes',
              completed: 2,
              rating: 4.5,
              ratingCount: 2,
            },
            trips: [{
              id: 't-1',
              from: 'Oujda',
              to: 'Bruxelles',
              departureDate: '2026-08-10',
              transportMode: 'plane',
            }],
          }],
        };
      },
    },
    userId: 'u-1',
    normalizeTransportMode: (value) => value,
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.trips[0].id, 't-1');
  assert.equal(result.body.stats.rating, 4.5);
});

test('avis relationnels lisent les notes imbriquees sans charger les operations', async () => {
  const calls = [];
  const responses = [
    { rows: [{ data: { id: 'u-1', rating: 5, ratingCount: 1 } }] },
    {
      rows: [{
        rating: { stars: 5, comment: 'Parfait', at: 50 },
        author_name: 'Aya',
      }],
    },
  ];
  const result = await relationalPublicReviews({
    pool: {
      async query(sql) {
        calls.push(sql);
        return responses.shift();
      },
    },
    userId: 'u-1',
  });
  assert.equal(result.body.reviews[0].authorName, 'Aya');
  assert.match(calls[1], /jsonb_array_elements/);
});

test('notation relationnelle verrouille operation et membre cible', async () => {
  const calls = [];
  const client = {
    async query(sql, params = []) {
      calls.push({ sql: String(sql), params });
      if (String(sql).includes('select data from public.wigolink_transactions')) {
        return {
          rows: [{
            data: {
              id: 'tx-1',
              senderId: 'u-1',
              travelerId: 'u-2',
              status: 'released',
              ratings: [],
              events: [],
            },
          }],
        };
      }
      if (String(sql).includes('select data from public.wigolink_users')) {
        return {
          rows: [{
            data: {
              id: 'u-2',
              rating: 4,
              ratingCount: 1,
            },
          }],
        };
      }
      return { rows: [] };
    },
    release() {},
  };
  const result = await rateRelationalOperation({
    pool: { connect: async () => client },
    transactionId: 'tx-1',
    user: { id: 'u-1' },
    body: {
      targetId: 'u-2',
      stars: 5,
      comment: 'Parfait',
    },
    detectLeak: () => false,
    now: () => 100,
  });
  assert.deepEqual(result, { status: 200, body: { ok: true } });
  assert.ok(calls.some(({ sql }) => (
    sql.includes('wigolink_transactions') && sql.includes('for update')
  )));
  assert.ok(calls.some(({ sql }) => (
    sql.includes('wigolink_users') && sql.includes('for update')
  )));
  const userUpdate = calls.find(({ sql }) => (
    sql.includes('update public.wigolink_users')
  ));
  assert.equal(JSON.parse(userUpdate.params[1]).rating, 4.5);
});
