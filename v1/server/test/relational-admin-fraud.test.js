import assert from 'node:assert/strict';
import test from 'node:test';
import { relationalAdminFraudState } from '../relational-admin-fraud.js';

test('fraude relationnelle utilise des agregats bornes', async () => {
  const calls = [];
  const responses = [
    {
      rows: [{
        first_user_id: 'u-1',
        second_user_id: 'u-2',
        transaction_count: 4,
        disputed_count: 2,
        total_value_eur: 42.5,
      }],
    },
    {
      rows: [
        { user_id: 'u-1', dispute_count: 3 },
        { user_id: 'u-2', dispute_count: 2 },
      ],
    },
  ];
  const result = await relationalAdminFraudState({
    pool: {
      async query(sql) {
        calls.push(sql);
        return responses.shift();
      },
    },
  });

  assert.deepEqual(result.repeatPairs, [{
    firstUserId: 'u-1',
    secondUserId: 'u-2',
    transactionCount: 4,
    disputedCount: 2,
    totalValueEur: 42.5,
  }]);
  assert.deepEqual(result.disputeCounts, {
    'u-1': 3,
    'u-2': 2,
  });
  assert.match(calls[0], /having count\(\*\) >= 2/);
  assert.match(calls[0], /limit 500/);
  assert.match(calls[1], /select distinct user_id/);
});
