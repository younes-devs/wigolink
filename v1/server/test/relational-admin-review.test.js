import test from 'node:test';
import assert from 'node:assert/strict';
import { createRelationalAdminReview } from '../relational-admin-review.js';

test('resolution admin relationnelle verrouille file, litige et operation', async () => {
  const calls = [];
  const notifications = [];
  const client = {
    async query(sql, params = []) {
      calls.push({ sql: String(sql), params });
      if (String(sql).includes('wigofly_review_queue')
        && String(sql).includes('select data')) {
        return {
          rows: [{
            data: {
              id: 'rq-1',
              type: 'dispute',
              refId: 'd-1',
              status: 'open',
            },
          }],
        };
      }
      if (String(sql).includes('wigofly_disputes')
        && String(sql).includes('select data')) {
        return {
          rows: [{
            data: {
              id: 'd-1',
              txId: 'tx-1',
              status: 'open',
            },
          }],
        };
      }
      if (String(sql).includes('wigofly_transactions')
        && String(sql).includes('select data')) {
        return {
          rows: [{
            data: {
              id: 'tx-1',
              senderId: 'u-1',
              travelerId: 'u-2',
              status: 'disputed',
              operationStatus: 'litige',
              escrow: { state: 'frozen' },
              events: [],
            },
          }],
        };
      }
      return { rows: [] };
    },
    release() {},
  };
  const review = createRelationalAdminReview({
    getPool: () => ({
      connect: async () => client,
    }),
    transitionEscrow(escrow, state, at) {
      escrow.state = state;
      escrow[`${state}At`] = at;
    },
    async notify(...args) {
      notifications.push(args);
    },
    async audit() {},
    now: () => 500,
  });

  const result = await review({
    actorId: 'admin',
    reviewId: 'rq-1',
    decision: 'release_traveler',
  });

  assert.deepEqual(result, {
    handled: true,
    status: 200,
    body: { ok: true },
  });
  for (const table of [
    'wigofly_review_queue',
    'wigofly_disputes',
    'wigofly_transactions',
  ]) {
    assert.ok(calls.some(({ sql }) => (
      sql.includes(table) && sql.includes('for update')
    )));
    assert.ok(calls.some(({ sql }) => (
      sql.includes(`update public.${table}`)
    )));
  }
  const txUpdate = calls.find(({ sql }) => (
    sql.includes('update public.wigofly_transactions')
  ));
  const transaction = JSON.parse(txUpdate.params[1]);
  assert.equal(transaction.status, 'released');
  assert.equal(transaction.operationStatus, 'termine');
  assert.equal(transaction.escrow.releasedAt, 500);
  assert.equal(notifications.length, 1);
});

test('resolution admin relationnelle laisse les revues non litige au service historique', async () => {
  const client = {
    async query(sql) {
      if (String(sql).includes('select data')) {
        return {
          rows: [{
            data: {
              id: 'rq-listing',
              type: 'listing',
              refId: 'l-1',
            },
          }],
        };
      }
      return { rows: [] };
    },
    release() {},
  };
  const review = createRelationalAdminReview({
    getPool: () => ({ connect: async () => client }),
    transitionEscrow() {},
    async notify() {},
    async audit() {},
  });
  assert.deepEqual(await review({
    actorId: 'admin',
    reviewId: 'rq-listing',
    decision: 'approve',
  }), { handled: false });
});
