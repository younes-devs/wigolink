import assert from 'node:assert/strict';
import test from 'node:test';
import { createConversationMessageService } from '../services/conversation-messages.js';

const IMAGE = 'data:image/png;base64,AAAA';

function createHarness(overrides = {}) {
  const events = [];
  const queue = [];
  let sequence = 0;
  const users = [
    { id: 'u-1', name: 'Yassine' },
    { id: 'u-2', name: 'Karim' },
    { id: 'u-3', name: 'Aya' },
  ];
  const db = {
    users,
    trips: [
      { id: 't-1', travelerId: 'u-2' },
    ],
    transactions: [
      { id: 'tx-1', senderId: 'u-1', travelerId: 'u-3' },
    ],
    conversations: [
      {
        id: 'conv-1',
        participantIds: ['u-1', 'u-2'],
        operationId: null,
        archivedBy: ['u-1'],
        createdAt: 100,
        lastMessageAt: 100,
      },
    ],
    messages: [],
  };
  const findUser = (id) => users.find((user) => user.id === id) || null;
  const dependencies = {
    db,
    isPartyToTransaction(transaction, userId) {
      return [transaction.senderId, transaction.travelerId].includes(userId);
    },
    findUser,
    findOrCreateConversation({ participantIds, tripId, operationId }) {
      const sorted = [...participantIds].sort();
      let conversation = db.conversations.find((item) =>
        item.participantIds.slice().sort().join('|') === sorted.join('|')
        && (item.tripId || null) === (tripId || null)
        && (item.operationId || null) === (operationId || null)
      );
      if (!conversation) {
        conversation = {
          id: `conv-${db.conversations.length + 1}`,
          participantIds: sorted,
          tripId,
          operationId,
          createdAt: 1000,
          lastMessageAt: 1000,
        };
        db.conversations.push(conversation);
      }
      return conversation;
    },
    conversationView(conversation) {
      return {
        id: conversation.id,
        participantIds: conversation.participantIds,
        lastMessageAt: conversation.lastMessageAt,
      };
    },
    conversationMessages(conversation) {
      return db.messages
        .filter((message) => message.conversationId === conversation.id)
        .sort((a, b) => a.at - b.at);
    },
    areParticipantsBlocked() {
      return false;
    },
    normalizeLocation(value, _conversation, at) {
      return value?.valid
        ? {
            kind: 'place',
            label: 'Gare',
            city: 'Bruxelles',
            expiresAt: at + 1000,
          }
        : null;
    },
    validPhotos(photos) {
      return photos.every((photo) => photo.startsWith('data:image/'));
    },
    analyzeSafety(text) {
      return text.includes('BLOCKED')
        ? {
            blocked: true,
            categories: ['phone'],
            severity: 'high',
          }
        : {
            blocked: false,
            categories: [],
            severity: 'none',
          };
    },
    registerSafetyAttempt() {
      return {
        cooldownUntil: null,
        highCount: 1,
      };
    },
    safetyError({ analysis, cooldownUntil }) {
      return {
        code: cooldownUntil ? 'cooldown' : 'blocked',
        categories: analysis.categories,
        cooldownUntil,
        error: 'Message bloque',
      };
    },
    reviewQueue: {
      open() {
        return queue;
      },
      append(item) {
        events.push(['queue', item]);
        queue.push(item);
      },
    },
    async notify(...args) {
      events.push(['notify', ...args]);
    },
    async audit(...args) {
      events.push(['audit', ...args]);
    },
    save() {
      events.push(['save']);
    },
    broadcastConversation(...args) {
      events.push(['broadcast', ...args]);
    },
    newId(prefix) {
      sequence += 1;
      return `${prefix}-${sequence}`;
    },
    now: () => 10_000,
    ...overrides,
  };
  return {
    db,
    events,
    queue,
    service: createConversationMessageService(dependencies),
    users,
  };
}

test('conversation messages cree une discussion directe, trajet ou operation autorisee', () => {
  const direct = createHarness();
  const existing = direct.service.createConversation(direct.users[0], {
    userId: 'u-2',
  });
  assert.equal(existing.status, 200);
  assert.equal(existing.body.conversation.id, 'conv-1');

  const trip = createHarness();
  const tripResult = trip.service.createConversation(trip.users[0], {
    tripId: 't-1',
  });
  assert.equal(tripResult.status, 200);
  assert.deepEqual(tripResult.body.conversation.participantIds, ['u-1', 'u-2']);

  const operation = createHarness();
  const operationResult = operation.service.createConversation(
    operation.users[0],
    { operationId: 'tx-1' },
  );
  assert.equal(operationResult.status, 200);
  assert.deepEqual(operationResult.body.conversation.participantIds, ['u-1', 'u-3']);
  assert.equal(operationResult.body.conversation.id, 'conv-2');
});

test('conversation messages refuse trajet, operation, destinataire et auto-discussion invalides', () => {
  const { service, users } = createHarness();

  assert.deepEqual(service.createConversation(users[0], { tripId: 'missing' }), {
    status: 404,
    body: { error: 'Trajet introuvable' },
  });
  assert.deepEqual(service.createConversation(users[1], { operationId: 'tx-1' }), {
    status: 404,
    body: { error: 'Operation introuvable' },
  });
  assert.deepEqual(service.createConversation(users[0], { userId: 'missing' }), {
    status: 400,
    body: { error: 'Destinataire invalide' },
  });
  assert.deepEqual(service.createConversation(users[0], { userId: 'u-1' }), {
    status: 400,
    body: { error: 'Conversation invalide' },
  });
});

test('conversation messages signale une discussion et dedoublonne la file de revue', async () => {
  const { events, queue, service, users } = createHarness();

  const first = await service.reportConversation('conv-1', users[0], {
    reasonCode: 'external_payment',
    reason: '  Paiement externe  ',
    comment: 'Capture jointe',
  });
  assert.equal(first.status, 200);
  assert.equal(first.body.report.reason, 'Paiement externe');
  assert.equal(first.body.report.reasonCode, 'external_payment');
  assert.deepEqual(queue, [{
    type: 'conversation',
    refId: 'conv-1',
  }]);
  assert.deepEqual(events.map(([type]) => type), ['queue', 'audit', 'save']);

  await service.reportConversation('conv-1', users[0], {
    reasonCode: 'inconnu',
    reason: 'Autre motif',
  });
  assert.equal(queue.length, 1);
});

test('conversation messages bloque une conversation, un cooldown et les charges invalides', async () => {
  const blocked = createHarness({
    areParticipantsBlocked: () => true,
  });
  assert.equal(
    (await blocked.service.sendMessage('conv-1', blocked.users[0], {
      text: 'Bonjour',
    })).status,
    403,
  );

  const cooldown = createHarness();
  cooldown.users[0].messageSafetyBlockedUntil = 20_000;
  const limited = await cooldown.service.sendMessage(
    'conv-1',
    cooldown.users[0],
    { text: 'Bonjour' },
  );
  assert.equal(limited.status, 429);
  assert.equal(limited.body.code, 'cooldown');

  const invalid = createHarness();
  assert.equal(
    (await invalid.service.sendMessage('conv-1', invalid.users[0], {})).status,
    400,
  );
  assert.equal(
    (await invalid.service.sendMessage('conv-1', invalid.users[0], {
      location: { valid: false },
    })).body.error,
    'Localisation invalide',
  );
  assert.equal(
    (await invalid.service.sendMessage('conv-1', invalid.users[0], {
      attachments: ['not-an-image'],
    })).body.error,
    'Piece jointe invalide',
  );
});

test('conversation messages audite et persiste une tentative interdite', async () => {
  const { db, events, service, users } = createHarness();
  const result = await service.sendMessage('conv-1', users[0], {
    text: 'BLOCKED',
  });

  assert.equal(result.status, 422);
  assert.equal(result.body.code, 'blocked');
  assert.equal(db.messages.length, 0);
  assert.deepEqual(events.map(([type]) => type), ['audit', 'save']);
  assert.equal(events[0][2], 'message.safety_blocked');
});

test('conversation messages est idempotent par clientId sans notifier deux fois', async () => {
  const { db, events, service, users } = createHarness();
  const first = await service.sendMessage('conv-1', users[0], {
    text: 'Bonjour',
    clientId: 'local-1',
  });
  const second = await service.sendMessage('conv-1', users[0], {
    text: 'Bonjour rejoue',
    clientId: 'local-1',
  });

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(first.body.message.id, second.body.message.id);
  assert.equal(db.messages.length, 1);
  assert.deepEqual(events.map(([type]) => type), [
    'notify',
    'save',
    'broadcast',
  ]);
});

test('conversation messages normalise une image puis notifie, sauvegarde et diffuse', async () => {
  const { db, events, service, users } = createHarness();
  const result = await service.sendMessage('conv-1', users[0], {
    attachments: [{
      dataUrl: IMAGE,
      name: 'preuve.png',
    }],
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.message.type, 'attachment');
  assert.equal(result.body.message.attachments[0].mime, 'image/png');
  assert.equal(result.body.message.attachments[0].name, 'preuve.png');
  assert.deepEqual(db.conversations[0].archivedBy, []);
  assert.deepEqual(events.map(([type]) => type), [
    'notify',
    'save',
    'broadcast',
  ]);

  assert.equal(result.body.message.attachments[0].dataUrl, undefined);
  const media = await service.attachment(
    'conv-1',
    result.body.message.id,
    result.body.message.attachments[0].id,
    users[1].id,
  );
  assert.equal(media.status, 200);
  assert.equal(media.contentType, 'image/png');
  assert.equal(Buffer.isBuffer(media.body), true);
  assert.equal(
    (await service.attachment(
      'conv-1',
      result.body.message.id,
      result.body.message.attachments[0].id,
      'u-outsider',
    )).status,
    404,
  );
});

test('conversation messages garde un repli inline si Supabase Storage est indisponible', async () => {
  const logs = [];
  const { db, service, users } = createHarness({
    messageMedia: {
      enabled: true,
      async storeDataUrl() {
        throw new Error('Storage indisponible');
      },
    },
    logger: {
      error(...args) {
        logs.push(args);
      },
    },
  });

  const result = await service.sendMessage('conv-1', users[0], {
    attachments: [{ dataUrl: IMAGE, name: 'preuve.png' }],
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.message.attachments[0].dataUrl, undefined);
  assert.match(result.body.message.attachments[0].url, /\/attachments\//);
  assert.equal(db.messages[0].attachments[0].dataUrl, IMAGE);
  assert.equal(logs[0][0], 'message_media_store_failed');
});

test('conversation messages refuse le repli inline en production', async () => {
  const { db, service, users } = createHarness({
    messageMedia: {
      enabled: true,
      async storeDataUrl() {
        throw new Error('Storage indisponible');
      },
    },
    allowInlineMediaFallback: false,
    logger: { error() {} },
  });

  const result = await service.sendMessage('conv-1', users[0], {
    attachments: [{ dataUrl: IMAGE, name: 'preuve.png' }],
  });

  assert.equal(result.status, 503);
  assert.equal(db.messages.length, 0);
});

test('conversation messages autorise uniquement l auteur a supprimer son message', () => {
  const { db, events, service } = createHarness();
  db.messages.push({
    id: 'm-own',
    conversationId: 'conv-1',
    from: 'u-1',
    text: 'Moi',
    at: 200,
  }, {
    id: 'm-other',
    conversationId: 'conv-1',
    from: 'u-2',
    text: 'Autre',
    at: 300,
  });

  assert.equal(
    service.deleteMessage('conv-1', 'm-other', 'u-1').status,
    403,
  );
  const removed = service.deleteMessage('conv-1', 'm-own', 'u-1');
  assert.equal(removed.status, 200);
  assert.deepEqual(db.messages.map(({ id }) => id), ['m-other']);
  assert.equal(db.conversations[0].lastMessageAt, 300);
  assert.deepEqual(events.map(([type]) => type), ['save', 'broadcast']);
});
