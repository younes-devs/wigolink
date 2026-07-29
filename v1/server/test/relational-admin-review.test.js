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

test('revue annonce relationnelle publie et promeut atomiquement', async () => {
  const calls = [];
  const client = {
    async query(sql, params = []) {
      calls.push({ sql: String(sql), params });
      if (String(sql).includes('wigofly_review_queue')
        && String(sql).includes('select data')) {
        return {
          rows: [{
            data: {
              id: 'rq-listing',
              type: 'listing',
              refId: 'l-1',
              status: 'open',
            },
          }],
        };
      }
      if (String(sql).includes('wigofly_listings')
        && String(sql).includes('select data')) {
        return {
          rows: [{
            data: {
              id: 'l-1',
              categoryId: 'documents',
              categoryLabel: 'Documents',
              whitelistVerdict: 'gray',
              status: 'review',
            },
          }],
        };
      }
      if (String(sql).includes('wigofly_custom_whitelist')
        && String(sql).includes('select id')) {
        return { rowCount: 0, rows: [] };
      }
      return { rows: [] };
    },
    release() {},
  };
  const audits = [];
  const review = createRelationalAdminReview({
    getPool: () => ({ connect: async () => client }),
    whitelist: [],
    transitionEscrow() {},
    async notify() {},
    async audit(...args) {
      audits.push(args);
    },
    now: () => 600,
  });
  const result = await review({
    actorId: 'admin',
    reviewId: 'rq-listing',
    decision: 'approve',
    maxQty: 3,
  });

  assert.deepEqual(result, {
    handled: true,
    status: 200,
    body: { ok: true },
  });
  const listingUpdate = calls.find(({ sql }) => (
    sql.includes('update public.wigofly_listings')
  ));
  assert.equal(JSON.parse(listingUpdate.params[1]).status, 'published');
  assert.ok(calls.some(({ sql }) => (
    sql.includes('insert into public.wigofly_custom_whitelist')
  )));
  assert.equal(audits[0][1], 'review.listing.approve');
});

test('revue conversation relationnelle conserve auteur et decision', async () => {
  const calls = [];
  const client = {
    async query(sql, params = []) {
      calls.push({ sql: String(sql), params });
      if (String(sql).includes('wigofly_review_queue')
        && String(sql).includes('select data')) {
        return {
          rows: [{
            data: {
              id: 'rq-conversation',
              type: 'conversation',
              refId: 'conv-1',
              status: 'open',
            },
          }],
        };
      }
      if (String(sql).includes('wigofly_conversations')
        && String(sql).includes('select data')) {
        return {
          rows: [{
            data: {
              id: 'conv-1',
              reports: [{ id: 'report-1', at: 1 }],
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
    now: () => 700,
  });

  const result = await review({
    actorId: 'admin',
    reviewId: 'rq-conversation',
    decision: 'conversation_watch',
  });

  assert.equal(result.status, 200);
  const conversationUpdate = calls.find(({ sql }) => (
    sql.includes('update public.wigofly_conversations')
  ));
  const conversation = JSON.parse(conversationUpdate.params[1]);
  assert.equal(conversation.moderationStatus, 'conversation_watch');
  assert.equal(conversation.reports[0].reviewedBy, 'admin');
  assert.equal(conversation.reports[0].decision, 'conversation_watch');
});
