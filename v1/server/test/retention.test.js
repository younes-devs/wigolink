import assert from 'node:assert/strict';
import test from 'node:test';
import { createRetentionService } from '../services/retention.js';

test('retention purge medias abandonnes et donnees temporaires expirees', async () => {
  const calls = [];
  const removed = [];
  const memberCleaned = [];
  const pool = {
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (sql.includes("kind in ('message_upload', 'member_media_upload')") && sql.includes('select kind')) {
        return {
          rows: [
            { kind: 'message_upload', id: 'att-1', data: { storagePath: 'conversations/c-1/att-1.jpg' } },
            { kind: 'message_upload', id: 'att-2', data: { storagePath: 'conversations/c-1/att-2.jpg' } },
            { kind: 'member_media_upload', id: 'media-1', data: { mediaType: 'kyc', uploads: [] } },
          ],
          rowCount: 3,
        };
      }
      if (sql.includes('wigolink_sessions')) return { rowCount: 4, rows: [] };
      if (sql.includes("kind not in ('message_upload', 'member_media_upload')")) return { rowCount: 3, rows: [] };
      if (sql.includes('public.notifications')) return { rowCount: 5, rows: [] };
      return { rowCount: 2, rows: [] };
    },
  };
  const retention = createRetentionService({
    getPool: () => pool,
    messageMedia: {
      enabled: true,
      async removePaths(paths) {
        removed.push(...paths);
      },
    },
    memberMediaUploads: {
      async cleanupMany(items) {
        memberCleaned.push(...items.map((data) => data.mediaType));
      },
    },
  });

  const result = await retention.run();

  assert.deepEqual(removed, [
    'conversations/c-1/att-1.jpg',
    'conversations/c-1/att-2.jpg',
  ]);
  assert.deepEqual(memberCleaned, ['kyc']);
  assert.deepEqual(result, {
    expiredUploads: 3,
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
        if (sql.includes('select kind, id, data')) {
          return {
            rows: [{ kind: 'message_upload', id: 'att-fail', data: { storagePath: 'failed.jpg' } }],
            rowCount: 1,
          };
        }
        return { rowCount: 0, rows: [] };
      },
    }),
    messageMedia: {
      enabled: true,
      async removePaths() {
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
      sql.includes("kind in ('message_upload', 'member_media_upload')")
      && sql.includes('id = any')
      && sql.startsWith('delete')
    )),
    false,
  );
});

test('retention draine plusieurs lots d uploads expires en un passage', async () => {
  const records = [
    { kind: 'message_upload', id: 'att-1', data: { storagePath: 'one.jpg' } },
    { kind: 'message_upload', id: 'att-2', data: { storagePath: 'two.jpg' } },
    { kind: 'message_upload', id: 'att-3', data: { storagePath: 'three.jpg' } },
  ];
  const batches = [];
  const pool = {
    async query(sql, params = []) {
      if (sql.includes('select kind, id, data')) {
        const rows = records.slice(0, params[0]);
        return { rows, rowCount: rows.length };
      }
      if (sql.includes('id = any')) {
        const removed = new Set(params[0]);
        for (let index = records.length - 1; index >= 0; index -= 1) {
          if (removed.has(records[index].id)) records.splice(index, 1);
        }
        return { rowCount: removed.size, rows: [] };
      }
      return { rowCount: 0, rows: [] };
    },
  };
  const retention = createRetentionService({
    getPool: () => pool,
    limit: 2,
    messageMedia: {
      enabled: true,
      async removePaths(paths) { batches.push(paths); },
    },
  });

  const result = await retention.run();

  assert.deepEqual(batches, [['one.jpg', 'two.jpg'], ['three.jpg']]);
  assert.equal(result.expiredUploads, 3);
  assert.equal(result.hasMoreUploads, false);
  assert.equal(records.length, 0);
});
