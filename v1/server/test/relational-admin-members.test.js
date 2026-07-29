import assert from 'node:assert/strict';
import test from 'node:test';
import {
  relationalAdminUsers,
  relationalAdminUsersByIds,
} from '../relational-admin-members.js';

test('admin relationnel recherche les membres avec une limite bornee', async () => {
  const calls = [];
  const pool = {
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (/count\(\*\)/.test(sql)) return { rows: [{ count: 2 }] };
      return {
        rows: [{
          data: { id: 'u-1', name: 'Alice', email: 'alice@example.test' },
        }],
      };
    },
  };

  const result = await relationalAdminUsers({
    pool,
    q: ' ALICE ',
    limit: 9_999,
  });

  assert.equal(result.users[0].id, 'u-1');
  assert.equal(result.adminCount, 2);
  assert.deepEqual(calls[0].params, ['alice', 100]);
  assert.match(calls[0].sql, /wigofly_users/);
});

test('admin relationnel charge les participants en une seule requete', async () => {
  const calls = [];
  const pool = {
    async query(sql, params) {
      calls.push({ sql, params });
      return {
        rows: params[0].map((id) => ({ data: { id, name: id } })),
      };
    },
  };

  const users = await relationalAdminUsersByIds({
    pool,
    ids: ['u-1', 'u-2', 'u-1'],
  });

  assert.deepEqual(users.map(({ id }) => id), ['u-1', 'u-2']);
  assert.deepEqual(calls[0].params, [['u-1', 'u-2']]);
});

