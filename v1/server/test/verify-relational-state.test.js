import assert from 'node:assert/strict';
import test from 'node:test';
import { REQUIRED_TABLES, verifyRelationalState } from '../verify-relational-state.js';

test('verification relationnelle refuse immediatement une table absente', async () => {
  const pool = {
    async query(sql) {
      assert.match(sql, /to_regclass/);
      return {
        rows: REQUIRED_TABLES.map((name) => ({
          name,
          present: name !== 'messages',
        })),
      };
    },
  };

  const result = await verifyRelationalState(pool);
  assert.equal(result.ready, false);
  assert.deepEqual(result.missingTables, ['messages']);
});

test('verification relationnelle compare la source et detecte les messages orphelins', async () => {
  const source = {
    users: [{ id: 'u-1' }],
    trips: [{ id: 't-1' }, { id: 't-2' }],
    messages: [{ id: 'm-1' }],
  };
  const pool = {
    async query(sql) {
      if (sql.includes('to_regclass')) {
        return { rows: REQUIRED_TABLES.map((name) => ({ name, present: true })) };
      }
      if (sql.includes('select state')) return { rows: [{ state: source }] };
      if (sql.includes('left join')) return { rows: [{ count: 1 }] };
      if (sql.includes('wigolink_trips')) return { rows: [{ count: 1 }] };
      return { rows: [{ count: 1 }] };
    },
  };

  const result = await verifyRelationalState(pool);
  assert.equal(result.ready, false);
  assert.equal(result.orphanMessages, 1);
  assert.equal(result.collections.find((item) => item.collection === 'trips').complete, false);
});
