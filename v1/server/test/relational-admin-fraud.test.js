import assert from 'node:assert/strict';
import test from 'node:test';
import { relationalAdminFraudState } from '../relational-admin-fraud.js';

test('fraude relationnelle utilise des agregats bornes', async () => {
  const calls = [];
  const responses = [
    {
      rows: [{
        signal: 'phone',
        value: '0600000000',
        users: [
          { id: 'u-1', name: 'Alice' },
          { id: 'u-2', name: 'Bob' },
        ],
      }],
    },
    {
      rows: [{
        first_user_id: 'u-1',
        second_user_id: 'u-2',
        first_name: 'Alice',
        second_name: 'Bob',
        transaction_count: 4,
        disputed_count: 2,
        total_value_eur: 42.5,
      }],
    },
    { rows: [{ user_id: 'u-1', name: 'Alice', count: 3 }] },
    {
      rows: [{
        data: {
          id: 'u-3',
          name: 'Charlie',
          completed: 4,
          cancelRate: 0.5,
        },
      }],
    },
    {
      rows: [
        { user_id: 'u-1', name: 'Alice', dispute_count: 3 },
        { user_id: 'u-2', name: 'Bob', dispute_count: 2 },
      ],
    },
    {
      rows: [{
        user_id: 'u-2',
        name: 'Bob',
        current_status: 'rejected',
        rejection_count: 2,
      }],
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

  assert.deepEqual(result.details.repeatPairs, [{
    users: [
      { id: 'u-1', name: 'Alice' },
      { id: 'u-2', name: 'Bob' },
    ],
    transactionCount: 4,
    disputedCount: 2,
    totalValueEur: 42.5,
  }]);
  assert.deepEqual(result.summary, {
    linkedAccounts: 1,
    repeatPairs: 1,
    flaggedMessaging: 1,
    abnormalCancel: 1,
    disputeProne: 2,
    kycRepeatRejections: 1,
  });
  assert.match(calls[0], /member_signals/);
  assert.match(calls[1], /having count\(\*\) >= 2/);
  assert.match(calls[4], /select distinct user_id/);
});
