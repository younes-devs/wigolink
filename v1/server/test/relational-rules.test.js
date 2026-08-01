import assert from 'node:assert/strict';
import test from 'node:test';
import { relationalCustomWhitelist } from '../relational-rules.js';

test('regles relationnelles chargent un catalogue borne et stable', async () => {
  const calls = [];
  const result = await relationalCustomWhitelist({
    pool: {
      async query(sql, params) {
        calls.push({ sql, params });
        return {
          rows: [
            { data: { id: 'custom-1', label: 'Categorie validee' } },
          ],
        };
      },
    },
    limit: 9_999,
  });

  assert.deepEqual(result, [
    { id: 'custom-1', label: 'Categorie validee' },
  ]);
  assert.match(calls[0].sql, /wigolink_custom_whitelist/);
  assert.match(calls[0].sql, /order by created_at asc, id asc/);
  assert.deepEqual(calls[0].params, [500]);
});
