import test from 'node:test';
import assert from 'node:assert/strict';
import { relationalAdminOperationState } from '../relational-admin-operations.js';

test('etat admin relationnel utilise agregats et files bornees', async () => {
  const calls = [];
  const responses = [
    {
      rows: [{
        transactions: 1200,
        released: 700,
        disputed: 12,
        escrow_held: 345.5,
      }],
    },
    { rows: [{ data: { id: 'd-1', status: 'open' } }] },
    { rows: [{ data: { id: 'rq-1', type: 'dispute' } }] },
  ];
  const result = await relationalAdminOperationState({
    pool: {
      async query(sql) {
        calls.push(sql);
        return responses.shift();
      },
    },
  });

  assert.deepEqual(result.stats, {
    transactions: 1200,
    released: 700,
    disputed: 12,
    escrowHeld: 345.5,
  });
  assert.equal(result.disputes[0].id, 'd-1');
  assert.equal(result.reviewQueue[0].id, 'rq-1');
  assert.match(calls[0], /count\(\*\)/);
  assert.match(calls[1], /limit 500/);
  assert.match(calls[2], /limit 200/);
});
