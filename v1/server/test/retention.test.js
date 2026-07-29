import assert from 'node:assert/strict';
import test from 'node:test';
import { createRetentionService } from '../services/retention.js';

test('retention purge medias abandonnes et donnees temporaires expirees', async () => {
  const calls = [];
  const removed = [];
  const pool = {
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (sql.includes("kind = 'message_upload'") && sql.includes('select id')) {
        return {
          rows: [
            { id: 'att-1', data: { storagePath: 'conversations/c-1/att-1.jpg' } },
            { id: 'att-2', data: { storagePath: 'conversations/c-1/att-2.jpg' } },
          ],
          rowCount: 2,
        };
      }
      if (sql.includes('wigofly_sessions')) return { rowCount: 4, rows: [] };
      if (sql.includes("kind <> 'message_upload'")) return { rowCount: 3, rows: [] };
      if (sql.includes('public.notifications')) return { rowCount: 5, rows: [] };
      return { rowCount: 2, rows: [] };
    },
  };
  const retention = createRetentionService({
    getPool: () => pool,
    messageMedia: {
      enabled: true,
      async remove(path) {
        removed.push(path);
      },
    },
  });

  const result = await retention.run();

  assert.deepEqual(removed, [
    'conversations/c-1/att-1.jpg',
    'conversations/c-1/att-2.jpg',
  ]);
  assert.deepEqual(result, {
    expiredUploads: 2,
    uploadFailures: 0,
    expiredSessions: 4,
    expiredRuntimeRecords: 3,
    expiredNotifications: 5,
    hasMoreUploads: false,
  });
  assert.ok(calls.some(({ sql }) => sql.includes("interval '10 days'")));
});

test('retention conserve une reservation si la suppression storage echoue', async () => {
  const calls = [];
  const retention = createRetentionService({
    getPool: () => ({
      async query(sql, params = []) {
        calls.push({ sql, params });
        if (sql.includes('select id, data')) {
          return {
            rows: [{ id: 'att-fail', data: { storagePath: 'failed.jpg' } }],
            rowCount: 1,
          };
        }
        return { rowCount: 0, rows: [] };
      },
    }),
    messageMedia: {
      enabled: true,
      async remove() {
        throw new Error('storage offline');
      },
    },
    logger: { error() {} },
  });

  const result = await retention.run();

  assert.equal(result.expiredUploads, 0);
  assert.equal(result.uploadFailures, 1);
  assert.equal(
    calls.some(({ sql }) => (
      sql.includes("kind = 'message_upload'")
      && sql.includes('id = any')
      && sql.startsWith('delete')
    )),
    false,
  );
});
