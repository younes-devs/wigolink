import assert from 'node:assert/strict';
import test from 'node:test';
import {
  scalabilityScenarios,
  summarizePlan,
} from '../../scripts/explain-scalability.mjs';

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
        'Relation Name': 'wigolink_users',
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

test('scenarios de charge couvrent les pages profondes sans offset', () => {
  const scenarios = scalabilityScenarios({
    runId: 'load-test',
    now: Date.parse('2026-08-01T12:00:00.000Z'),
  });
  const names = scenarios.map(({ name }) => name);

  assert.ok(names.includes('conversation-inbox-next'));
  assert.ok(names.includes('message-page-next'));
  assert.ok(names.includes('admin-message-archive-next'));
  assert.ok(names.includes('operations-member-next'));
  assert.ok(names.includes('saved-trips-member-next'));
  assert.ok(names.includes('audit-latest-next'));
  assert.ok(names.includes('admin-members-next'));
  for (const scenario of scenarios.filter(({ name }) => name.endsWith('-next'))) {
    assert.doesNotMatch(scenario.sql, /\boffset\b/i);
  }
});
