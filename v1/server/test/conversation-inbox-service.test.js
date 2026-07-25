import assert from 'node:assert/strict';
import test from 'node:test';
import { createConversationInboxService } from '../services/conversation-inbox.js';

function createHarness() {
  const events = [];
  const users = [
    { id: 'u-1', name: 'Yassine', blockedUserIds: [] },
    { id: 'u-2', name: 'Karim', blockedUserIds: [] },
    { id: 'u-3', name: 'Aya', blockedUserIds: [] },
  ];
  const db = {
    conversations: [
      {
        id: 'conv-1',
        participantIds: ['u-1', 'u-2'],
        archivedBy: [],
        pinnedBy: [],
        blockedBy: [],
        createdAt: 100,
        lastMessageAt: 300,
      },
      {
        id: 'conv-2',
        participantIds: ['u-1', 'u-3'],
        archivedBy: ['u-1'],
        pinnedBy: ['u-1'],
        deletedBy: [],
        createdAt: 200,
        lastMessageAt: 400,
      },
      {
        id: 'conv-deleted',
        participantIds: ['u-1', 'u-3'],
        deletedBy: ['u-1'],
        createdAt: 50,
      },
    ],
    messages: [
      {
        id: 'm-1',
        conversationId: 'conv-1',
        from: 'u-2',
        text: 'Bonjour',
        readBy: ['u-2'],
        at: 250,
      },
      {
        id: 'm-2',
        conversationId: 'conv-1',
        from: 'u-2',
        text: 'Dernier message',
        readBy: ['u-1', 'u-2'],
        at: 300,
      },
    ],
  };
  const findUser = (id) => users.find((user) => user.id === id) || null;
  const blockedUserIds = (user) => new Set(user.blockedUserIds || []);
  const service = createConversationInboxService({
    db,
    conversationView(conversation, viewerId) {
      const otherId = conversation.participantIds.find((id) => id !== viewerId);
      return {
        ...conversation,
        other: findUser(otherId),
        archived: (conversation.archivedBy || []).includes(viewerId),
        pinned: (conversation.pinnedBy || []).includes(viewerId),
        unreadCount: db.messages.filter((message) =>
          message.conversationId === conversation.id
          && message.from !== viewerId
          && !(message.readBy || []).includes(viewerId)
        ).length,
        lastMessagePreview: conversation.id === 'conv-1' ? 'Bonjour' : 'Archive',
        status: 'active',
      };
    },
    conversationMessagesPage(conversation, query) {
      return {
        messages: db.messages.filter((message) =>
          message.conversationId === conversation.id
        ),
        page: { q: query.q || '' },
      };
    },
    markConversationRead(conversationId, userId) {
      let changed = false;
      for (const message of db.messages) {
        if (
          message.conversationId === conversationId
          && message.from !== userId
          && !message.readBy.includes(userId)
        ) {
          message.readBy.push(userId);
          changed = true;
        }
      }
      return changed;
    },
    unreadConversationCount(userId) {
      return db.messages.filter((message) =>
        message.from !== userId
        && !(message.readBy || []).includes(userId)
      ).length;
    },
    broadcastConversation(...args) {
      events.push(['broadcast', ...args]);
    },
    blockedUserIds,
    findUser,
    publicUser(user) {
      return user && { id: user.id, name: user.name };
    },
    async audit(...args) {
      events.push(['audit', ...args]);
    },
    save() {
      events.push(['save']);
    },
  });
  return {
    db,
    events,
    service,
    users,
  };
}

test('conversation inbox filtre, recherche et masque les conversations supprimees', () => {
  const { service, users } = createHarness();

  assert.deepEqual(
    service.list(users[0], {}).conversations.map(({ id }) => id),
    ['conv-1'],
  );
  assert.deepEqual(
    service.list(users[0], { filter: 'archived' }).conversations.map(({ id }) => id),
    ['conv-2'],
  );
  assert.deepEqual(
    service.list(users[0], { includeArchived: '1', q: 'karim' })
      .conversations.map(({ id }) => id),
    ['conv-1'],
  );
  assert.equal(service.detail('conv-deleted', 'u-1'), null);
});

test('conversation inbox lit les messages et sauvegarde uniquement si necessaire', () => {
  const { events, service } = createHarness();

  const result = service.messages('conv-1', 'u-1', { q: 'bonjour' });

  assert.equal(result.messages.length, 2);
  assert.deepEqual(result.page, { q: 'bonjour' });
  assert.deepEqual(events, [['save']]);
  assert.equal(result.conversation.unreadCount, 0);

  service.messages('conv-1', 'u-1');
  assert.deepEqual(events, [['save']]);
});

test('conversation inbox diffuse un accuse de lecture seulement apres mutation', () => {
  const { events, service } = createHarness();

  const result = service.markRead('conv-1', 'u-1');

  assert.equal(result.messagesUnread, 0);
  assert.deepEqual(events.map(([type]) => type), ['save', 'broadcast']);
  assert.deepEqual(events[1].slice(2), [{
    type: 'read',
    userId: 'u-1',
  }]);

  service.markRead('conv-1', 'u-1');
  assert.deepEqual(events.map(([type]) => type), ['save', 'broadcast']);
});

test('conversation inbox gere non-lu, archive, epingle et saisie', () => {
  const { db, events, service } = createHarness();

  service.markUnread('conv-1', 'u-1');
  assert.equal(db.messages[1].readBy.includes('u-1'), false);
  service.archive('conv-1', 'u-1', true);
  service.pin('conv-1', 'u-1', true);
  assert.deepEqual(db.conversations[0].archivedBy, ['u-1']);
  assert.deepEqual(db.conversations[0].pinnedBy, ['u-1']);
  assert.equal(service.typing('conv-1', 'u-1', true), true);
  assert.deepEqual(events.at(-1).slice(2), [
    {
      type: 'typing',
      userId: 'u-1',
      active: true,
    },
    'u-1',
  ]);
});

test('conversation inbox bloque, debloque et conserve une suppression en audit', async () => {
  const { db, events, service, users } = createHarness();
  const user = users[0];

  const blocked = await service.block('conv-1', user, true);
  assert.equal(blocked.blocked, true);
  assert.deepEqual(user.blockedUserIds, ['u-2']);
  assert.deepEqual(db.conversations[0].blockedBy, ['u-1']);
  assert.deepEqual(service.listBlocked(user), {
    users: [{ id: 'u-2', name: 'Karim' }],
  });

  assert.equal(await service.unblock(user, 'u-2'), true);
  assert.deepEqual(user.blockedUserIds, []);
  assert.deepEqual(db.conversations[0].blockedBy, []);

  assert.equal(await service.remove('conv-1', 'u-1'), true);
  assert.deepEqual(db.conversations[0].deletedBy, ['u-1']);
  assert.equal(db.messages.length, 2);
  const deletionAudit = events.find((event) =>
    event[0] === 'audit' && event[2] === 'conversation.delete'
  );
  assert.equal(deletionAudit[5].retainedForAdmin, true);
  assert.equal(deletionAudit[5].messageCount, 2);
});
