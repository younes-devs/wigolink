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
  assert.match(calls[0].sql, /wigofly_conversations/);
  assert.match(calls[0].sql, /messages/);
  assert.ok(calls[0].params.includes('u-1'));
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

test('messagerie relationnelle : archive admin inclut les messages masques et leurs totaux', async () => {
  const calls = [];
  const pool = {
    query(sql, params) {
      calls.push({ sql, params });
      if (calls.length === 1) {
        return {
          rows: [{
            conversation: row.conversation,
            message_count: 3,
            reports: [{ id: 'cr-1', reason: 'Signalement conserve' }],
          }],
        };
      }
      return {
        rows: [{
          data: {
            id: 'm-deleted',
            conversationId: 'conv-1',
            hiddenForParticipants: true,
            deletedAt: 500,
          },
          total: 3,
        }],
      };
    },
  };
  const archive = await relationalAdminMessageArchive({
    pool,
    userId: 'u-1',
    offset: 0,
    limit: 50,
  });

  assert.equal(archive.conversations[0].messageCount, 3);
  assert.equal(archive.conversations[0].reports[0].id, 'cr-1');
  assert.equal(archive.messages[0].hiddenForParticipants, true);
  assert.equal(archive.total, 3);
  assert.match(calls[0].sql, /wigofly_conversation_reports/);
  assert.match(calls[1].sql, /count\(\*\) over\(\)/);
});
