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
  assert.deepEqual(calls[0].params, ['alice', 101]);
  assert.match(calls[0].sql, /wigolink_users/);
  assert.equal(result.page.hasMore, false);
});

test('admin relationnel poursuit les membres sans offset', async () => {
  const calls = [];
  const pool = {
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (/count\(\*\)/.test(sql)) return { rows: [{ count: 1 }] };
      return {
        rows: [
          { id: 'u-1', data: { id: 'u-1' }, admin_rank: 0, sort_created_at: 20 },
          { id: 'u-2', data: { id: 'u-2' }, admin_rank: 1, sort_created_at: 10 },
        ],
      };
    },
  };

  const first = await relationalAdminUsers({ pool, limit: 1 });
  assert.equal(first.page.hasMore, true);
  assert.ok(first.page.nextCursor);

  calls.length = 0;
  await relationalAdminUsers({
    pool,
    limit: 1,
    cursor: first.page.nextCursor,
  });
  assert.doesNotMatch(calls[0].sql, /offset/i);
  assert.match(calls[0].sql, /id > \$4/);
  assert.deepEqual(calls[0].params.slice(0, 4), ['', 0, 20, 'u-1']);
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
