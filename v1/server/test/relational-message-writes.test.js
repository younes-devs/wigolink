import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createRelationalMessageWriter,
  relationalMessageWritesEnabled,
} from '../relational-message-writes.js';

const user = {
  id: 'u-1',
  name: 'Younes',
  blockedUserIds: [],
};
const conversation = {
  id: 'conv-1',
  participantIds: ['u-1', 'u-2'],
  createdAt: 100,
  lastMessageAt: 100,
};
const contextRow = {
  conversation,
  other: {
    id: 'u-2',
    name: 'Karim',
    blockedUserIds: [],
  },
  operation: null,
};

function createHarness({
  existing = null,
  attachment = null,
  foundMessage = null,
} = {}) {
  const queries = [];
  const mediaRemoved = [];
  const broadcasts = [];
  let sequence = 0;
  const query = async (sql, params = []) => {
    queries.push({ sql, params });
    if (sql.includes('select c.data as conversation')) {
      return { rows: [contextRow], rowCount: 1 };
    }
    if (sql.includes('where conversation_id = $1 and from_id = $2 and client_id = $3')) {
      return { rows: existing ? [{ data: existing }] : [], rowCount: existing ? 1 : 0 };
    }
    if (sql.includes('select text from public.messages')) {
      return { rows: [], rowCount: 0 };
    }
    if (sql.includes('select from_id, data from public.messages')) {
      return {
        rows: foundMessage ? [{
          from_id: foundMessage.from,
          data: foundMessage,
        }] : [],
        rowCount: foundMessage ? 1 : 0,
      };
    }
    if (sql.includes('extract(epoch from at)')) {
      return { rows: [{ at: 100 }], rowCount: 1 };
    }
    if (sql.includes('select m.data') && sql.includes('attachment')) {
      return { rows: attachment ? [{ data: { attachments: [attachment] } }] : [] };
    }
    return { rows: [], rowCount: 1 };
  };
  const client = {
    query,
    release() {
      queries.push({ sql: 'release', params: [] });
    },
  };
  const pool = {
    query,
    async connect() {
      return client;
    },
  };
  const writer = createRelationalMessageWriter({
    getPool: () => pool,
    getConversation: async () => ({ conversation: { ...conversation } }),
    validPhotos: () => true,
    analyzeSafety: () => ({ blocked: false, categories: [], severity: 'none' }),
    safetyError: () => ({ error: 'blocked' }),
    messageMedia: {
      enabled: false,
      async remove(path) {
        mediaRemoved.push(path);
      },
      async download() {
        return { status: 200, body: Buffer.from('image'), contentType: 'image/jpeg' };
      },
    },
    notificationFor: async () => ({
      key: 'chat.message',
      params: { name: 'Younes' },
      text: 'Nouveau message',
    }),
    broadcastConversation(_conversation, event) {
      broadcasts.push(event);
    },
    newId(prefix) {
      sequence += 1;
      return `${prefix}-${sequence}`;
    },
    now: () => 1_000,
    logger: { error() {} },
  });
  return {
    broadcasts,
    mediaRemoved,
    queries,
    writer,
  };
}

test('ecritures messages relationnelles : option inactive par defaut', () => {
  assert.equal(relationalMessageWritesEnabled({}), false);
  assert.equal(
    relationalMessageWritesEnabled({ RELATIONAL_MESSAGE_WRITES: 'true' }),
    true,
  );
});

test('ecritures messages relationnelles : insere un message idempotent avec un id serveur', async () => {
  const harness = createHarness();
  const result = await harness.writer.send({
    user,
    conversationId: 'conv-1',
    body: {
      clientId: 'client-1',
      messageId: 'id-controle-par-client',
      text: 'Bonjour',
    },
    today: '2026-07-28',
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.message.id, 'm-1');
  assert.notEqual(result.body.message.id, 'id-controle-par-client');
  const insert = harness.queries.find(({ sql }) =>
    sql.includes('insert into public.messages')
  );
  assert.equal(insert.params[0], 'm-1');
  assert.equal(insert.params[4], 'client-1');
  assert.deepEqual(
    harness.broadcasts.map(({ type }) => type),
    ['message'],
  );
});

test('ecritures messages relationnelles : une relance client ne cree pas de doublon', async () => {
  const duplicate = {
    id: 'm-existing',
    clientId: 'client-1',
    conversationId: 'conv-1',
    from: 'u-1',
    text: 'Bonjour',
    attachments: [],
    at: 900,
  };
  const harness = createHarness({ existing: duplicate });
  const result = await harness.writer.send({
    user,
    conversationId: 'conv-1',
    body: { clientId: 'client-1', text: 'Bonjour' },
    today: '2026-07-28',
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.message.id, 'm-existing');
  assert.equal(
    harness.queries.some(({ sql }) => sql.includes('insert into public.messages')),
    false,
  );
});

test('ecritures messages relationnelles : suppression logique conserve la preuve et les medias', async () => {
  const harness = createHarness({
    foundMessage: {
      id: 'm-1',
      conversationId: 'conv-1',
      from: 'u-1',
      text: 'Preuve',
      attachments: [{ id: 'att-1', storagePath: 'private/image.jpg' }],
      at: 900,
    },
  });
  const result = await harness.writer.remove({
    user,
    conversationId: 'conv-1',
    messageId: 'm-1',
    today: '2026-07-28',
  });

  assert.equal(result.status, 200);
  assert.equal(
    harness.queries.some(({ sql }) => sql.includes('delete from public.messages')),
    false,
  );
  const update = harness.queries.find(({ sql }) =>
    sql.includes('update public.messages')
  );
  const retained = JSON.parse(update.params[1]);
  assert.equal(retained.hiddenForParticipants, true);
  assert.equal(retained.text, 'Preuve');
  assert.equal(retained.attachments[0].storagePath, 'private/image.jpg');
  assert.deepEqual(harness.mediaRemoved, []);
  assert.equal(
    harness.queries.some(({ sql }) =>
      sql.includes("'message.delete'")
      && sql.includes('audit_logs')
    ),
    true,
  );
});
