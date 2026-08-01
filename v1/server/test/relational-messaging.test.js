import test from 'node:test';
import assert from 'node:assert/strict';
import {
  listRelationalConversations, relationalConversation, relationalConversationMessages,
  relationalAdminMessageArchive, relationalMessageReadsEnabled,
} from '../relational-messaging.js';

const row = {
  conversation: { id: 'conv-1', participantIds: ['u-1', 'u-2'], tripId: 't-1', createdAt: 100 },
  other: { id: 'u-2', name: 'Karim', kycStatus: 'verified' },
  trip: { id: 't-1', from: 'Oujda', to: 'Bruxelles', date: '2026-08-01', price: 25 },
  operation: null,
  last_message: { id: 'm-1', conversationId: 'conv-1', from: 'u-2', text: 'Bonjour', at: 200, readBy: ['u-2'] },
  unread_count: 1,
};

test('messagerie relationnelle : l option est inactive par defaut', () => {
  assert.equal(relationalMessageReadsEnabled({}), false);
  assert.equal(relationalMessageReadsEnabled({ RELATIONAL_MESSAGE_READS: 'true' }), true);
});

test('messagerie relationnelle : lit les conversations par participant et retourne le resume attendu', async () => {
  const calls = [];
  const data = await listRelationalConversations({
    pool: { query(sql, params) { calls.push({ sql, params }); return { rows: [row] }; } },
    user: { id: 'u-1' }, query: { filter: 'all' }, today: '2026-07-17',
  });
  assert.equal(data.conversations[0].other.name, 'Karim');
  assert.equal(data.conversations[0].unreadCount, 1);
  assert.equal(data.conversations[0].context.href, '/trajets/t-1');
  assert.match(calls[0].sql, /wigolink_conversations/);
  assert.match(calls[0].sql, /messages/);
  assert.ok(calls[0].params.includes('u-1'));
});

test('messagerie relationnelle : poursuit la boite avec un curseur stable', async () => {
  const rows = [
    { ...row, conversation: { ...row.conversation, id: 'conv-1' }, sort_at: 300 },
    { ...row, conversation: { ...row.conversation, id: 'conv-2' }, sort_at: 200 },
    { ...row, conversation: { ...row.conversation, id: 'conv-3' }, sort_at: 100 },
  ];
  const first = await listRelationalConversations({
    pool: { async query() { return { rows }; } },
    user: { id: 'u-1' }, query: { limit: 2 }, today: '2026-07-17',
  });
  assert.equal(first.conversations.length, 2);
  assert.ok(first.page.nextCursor);

  const calls = [];
  await listRelationalConversations({
    pool: { async query(sql, params) { calls.push({ sql, params }); return { rows: [] }; } },
    user: { id: 'u-1' }, query: { limit: 2, cursor: first.page.nextCursor }, today: '2026-07-17',
  });
  assert.match(calls[0].sql, /c\.id >/);
  assert.doesNotMatch(calls[0].sql, /offset \$/i);
  assert.deepEqual(calls[0].params.slice(0, 3), ['u-1', 200, 'conv-2']);
});

test('messagerie relationnelle : charge une page de messages sans le document global', async () => {
  const calls = [];
  const pool = {
    query(sql, params) {
      calls.push({ sql, params });
      if (calls.length === 1) return { rows: [row] };
      return { rows: [
        { data: { id: 'm-2', conversationId: 'conv-1', from: 'u-1', text: 'Salut', at: 300 } },
        { data: { id: 'm-1', conversationId: 'conv-1', from: 'u-2', text: 'Bonjour', at: 200 } },
      ] };
    },
  };
  const data = await relationalConversation({
    pool, user: { id: 'u-1' }, id: 'conv-1', query: { limit: 50 }, today: '2026-07-17', includeMessages: true,
  });
  assert.equal(data.messages.length, 2);
  assert.equal(data.messages[0].id, 'm-1');
  assert.equal(data.messages[1].id, 'm-2');
  assert.match(calls[1].sql, /conversation_id/);
});

test('messagerie relationnelle : synchronise uniquement les messages plus recents', async () => {
  const calls = [];
  const data = await relationalConversationMessages({
    pool: {
      query(sql, params) {
        calls.push({ sql, params });
        return {
          rows: [
            { data: { id: 'm-3', conversationId: 'conv-1', at: 301, text: 'Nouveau' } },
          ],
        };
      },
    },
    conversationId: 'conv-1',
    query: { after: 300, limit: 50 },
  });
  assert.deepEqual(data.messages.map(({ id }) => id), ['m-3']);
  assert.match(calls[0].sql, /> \$2/);
  assert.match(calls[0].sql, /order by m.at asc/);
  assert.deepEqual(calls[0].params, ['conv-1', 300, 51]);
});

test('messagerie relationnelle utilise l etat participant indexe', async () => {
  const calls = [];
  const data = await listRelationalConversations({
    pool: {
      async query(sql, params) {
        calls.push({ sql, params });
        return {
          rows: [{
            ...row,
            member_archived: true,
            member_pinned: true,
            member_blocked: false,
            member_last_read_at: 150,
          }],
        };
      },
    },
    user: { id: 'u-1' },
    query: { includeArchived: '1' },
    today: '2026-07-17',
    memberStateEnabled: true,
  });

  assert.equal(data.conversations[0].archived, true);
  assert.equal(data.conversations[0].pinned, true);
  assert.equal(data.conversations[0].lastReadAt, 150);
  assert.match(calls[0].sql, /wigolink_conversation_members member/);
  assert.match(calls[0].sql, /m\.at > coalesce\(member\.last_read_at/);
  assert.doesNotMatch(calls[0].sql, /data->'readBy'/);
});

test('recus de lecture sont derives du curseur participant', async () => {
  const data = await relationalConversationMessages({
    pool: {
      async query() {
        return {
          rows: [{
            data: {
              id: 'm-1',
              conversationId: 'conv-1',
              from: 'u-1',
              text: 'Bonjour',
              at: 200,
              readBy: ['u-1'],
            },
            member_read_by: ['u-2'],
          }],
        };
      },
    },
    conversationId: 'conv-1',
    memberStateEnabled: true,
  });

  assert.deepEqual(data.messages[0].readBy.sort(), ['u-1', 'u-2']);
});

test('messagerie relationnelle : archive admin inclut les messages masques et leurs totaux', async () => {
  const calls = [];
  const pool = {
    query(sql, params) {
      calls.push({ sql, params });
      if (calls.length === 1) {
        return {
          rows: [{
            id: 'm-deleted',
            conversation_id: 'conv-1',
            at: new Date(500),
            data: {
              id: 'm-deleted',
              conversationId: 'conv-1',
              hiddenForParticipants: true,
              deletedAt: 500,
            },
          }],
        };
      }
      if (calls.length === 2) return { rows: [{ message_total: 3, conversation_total: 1 }] };
      return { rows: [{
        conversation: row.conversation,
        message_count: 3,
        reports: [{ id: 'cr-1', reason: 'Signalement conserve' }],
      }] };
    },
  };
  const archive = await relationalAdminMessageArchive({
    pool,
    userId: 'u-1',
    limit: 50,
  });

  assert.equal(archive.conversations[0].messageCount, 3);
  assert.equal(archive.conversations[0].reports[0].id, 'cr-1');
  assert.equal(archive.messages[0].hiddenForParticipants, true);
  assert.equal(archive.total, 3);
  assert.equal(archive.conversationTotal, 1);
  assert.match(calls[0].sql, /order by m\.at desc, m\.id desc/);
  assert.match(calls[1].sql, /conversation_total/);
  assert.match(calls[2].sql, /wigolink_conversation_reports/);
  assert.deepEqual(calls[2].params, [['conv-1']]);
});

test('messagerie relationnelle : archive admin poursuit sans offset ni recalcul des totaux', async () => {
  const calls = [];
  const pool = {
    query(sql, params) {
      calls.push({ sql, params });
      if (calls.length === 1) return { rows: [
        { id: 'm-3', conversation_id: 'conv-1', at: new Date(300), data: { id: 'm-3', conversationId: 'conv-1', at: 300 } },
        { id: 'm-2', conversation_id: 'conv-1', at: new Date(200), data: { id: 'm-2', conversationId: 'conv-1', at: 200 } },
      ] };
      return { rows: [{ conversation: row.conversation, message_count: 2, reports: [] }] };
    },
  };

  const first = await relationalAdminMessageArchive({ pool, userId: 'u-1', limit: 1 });
  assert.equal(first.hasMore, true);
  assert.ok(first.nextCursor);

  calls.length = 0;
  await relationalAdminMessageArchive({
    pool,
    userId: 'u-1',
    limit: 1,
    cursor: first.nextCursor,
  });
  assert.match(calls[0].sql, /\(m\.at, m\.id\) < \(\$2, \$3\)/);
  assert.doesNotMatch(calls[0].sql, /offset/i);
  assert.equal(calls.some(({ sql }) => /message_total/.test(sql)), false);
});
