import test from 'node:test';
import assert from 'node:assert/strict';
import {
  operationActionRequired,
  relationalNavigationEnabled,
  relationalNavigationSummary,
} from '../relational-navigation.js';

test('navigation relationnelle s active avec messages ou operations', () => {
  assert.equal(relationalNavigationEnabled({}), false);
  assert.equal(relationalNavigationEnabled({
    RELATIONAL_MESSAGE_READS: 'true',
  }), true);
  assert.equal(relationalNavigationEnabled({
    RELATIONAL_OPERATION_WRITES: 'true',
  }), true);
});

test('navigation relationnelle compte les conversations et actions en SQL', async () => {
  const calls = [];
  const result = await relationalNavigationSummary({
    pool: {
      async query(sql, params) {
        calls.push({ sql, params });
        return {
          rows: [{
            messages_unread: 3,
            operations_action_required: 2,
          }],
        };
      },
    },
    user: { id: 'u-1' },
  });

  assert.deepEqual(result, {
    messagesUnread: 3,
    operationsActionRequired: 2,
  });
  assert.deepEqual(calls[0].params, ['u-1']);
  assert.match(calls[0].sql, /count\(distinct c\.id\)/);
  assert.match(calls[0].sql, /wigofly_transactions/);
  assert.doesNotMatch(calls[0].sql, /operation_requires_action/);
});

test('action operation conserve la machine de statuts du menu', () => {
  assert.equal(operationActionRequired({
    operationStatus: 'attente_confirmation',
    travelerId: 'u-1',
  }, 'u-1'), true);
  assert.equal(operationActionRequired({
    operationStatus: 'paye',
    travelerId: 'u-1',
    senderId: 'u-2',
    securityCodes: {},
  }, 'u-1'), true);
  assert.equal(operationActionRequired({
    operationStatus: 'paye',
    travelerId: 'u-1',
    senderId: 'u-2',
    securityCodes: { pickup: { issuedAt: 10 } },
  }, 'u-1'), false);
});
