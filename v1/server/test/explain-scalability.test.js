import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizePlan } from '../../scripts/explain-scalability.mjs';

test('resume explain extrait latence, noeuds et scans suspects', () => {
  const summary = summarizePlan([{
    'Planning Time': 1.2,
    'Execution Time': 42.5,
    Plan: {
      'Node Type': 'Limit',
      'Plan Rows': 50,
      Plans: [{
        'Node Type': 'Seq Scan',
        'Relation Name': 'messages',
        'Plan Rows': 500_000,
      }, {
        'Node Type': 'Index Scan',
        'Relation Name': 'wigofly_users',
        'Plan Rows': 1,
      }],
    },
  }]);

  assert.equal(summary.planningMs, 1.2);
  assert.equal(summary.executionMs, 42.5);
  assert.deepEqual(summary.nodes, ['Limit', 'Seq Scan', 'Index Scan']);
  assert.deepEqual(summary.suspiciousScans, [{
    relation: 'messages',
    estimatedRows: 500_000,
  }]);
});
