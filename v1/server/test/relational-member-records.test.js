import test from 'node:test';
import assert from 'node:assert/strict';
import {
  relationalActiveOperationCount,
  relationalMemberRecords,
} from '../relational-member-records.js';

test('dossier membre relationnel charge chaque collection par son identifiant', async () => {
  const calls = [];
  const records = await relationalMemberRecords({
    pool: {
      async query(sql, params) {
        calls.push({ sql, params });
        return {
          rows: [{
            trips: [{ id: 't-1' }],
            listings: [{ id: 'l-1' }],
            transactions: [{ id: 'tx-1' }],
            disputes: [{ id: 'd-1' }],
            notifications: [{ id: 'n-1' }],
            safety_appeals: [{ id: 'appeal-1' }],
          }],
        };
      },
    },
    userId: 'u-1',
  });

  assert.deepEqual(records.transactions.map(({ id }) => id), ['tx-1']);
  assert.deepEqual(records.disputes.map(({ id }) => id), ['d-1']);
  assert.deepEqual(
    records.safetyAppeals.map(({ id }) => id),
    ['appeal-1'],
  );
  assert.deepEqual(calls[0].params, ['u-1']);
  assert.match(calls[0].sql, /wigofly_trips/);
  assert.match(calls[0].sql, /wigofly_transactions/);
  assert.match(calls[0].sql, /notifications/);
  assert.match(calls[0].sql, /safety_appeal/);
});

test('compteur actif relationnel exclut tous les etats fermes', async () => {
  const calls = [];
  const count = await relationalActiveOperationCount({
    pool: {
      async query(sql, params) {
        calls.push({ sql, params });
        return { rows: [{ count: 4 }] };
      },
    },
    userId: 'u-1',
  });

  assert.equal(count, 4);
  assert.deepEqual(calls[0].params, ['u-1']);
  assert.match(calls[0].sql, /released', 'refunded', 'cancelled/);
});
