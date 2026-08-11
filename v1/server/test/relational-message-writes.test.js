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
  mediaEnabled = false,
  mediaInfo = null,
  memberState = false,
  latestIncomingAt = null,
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
    if (
      sql.includes('from public.wigolink_runtime_records')
      && sql.includes("kind = 'message_upload'")
      && sql.includes('expires_at > now()')
    ) {
      return {
        rows: (params[0] || []).map((id) => ({
          id,
          data: {
            userId: user.id,
            conversationId: conversation.id,
            storagePath: `conversations/${conversation.id}/${id}.jpg`,
          },
        })),
        rowCount: (params[0] || []).length,
      };
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
    if (
      sql.includes('select id, data, at from public.messages')
      && sql.includes('from_id <> $2')
    ) {
      return latestIncomingAt === null
        ? { rows: [], rowCount: 0 }
        : {
          rows: [{
            id: 'm-latest',
            data: { id: 'm-latest', from: 'u-2', at: latestIncomingAt },
            at: latestIncomingAt,
          }],
          rowCount: 1,
        };
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
      enabled: mediaEnabled,
      async createSignedUpload({ conversationId, attachmentId, mime }) {
        return {
          attachmentId,
          storagePath: `conversations/${conversationId}/${attachmentId}.jpg`,
          signedUrl: 'https://storage.example.test/upload',
          mime,
        };
      },
      async info() {
        return mediaInfo;
      },
      async remove(path) {
        mediaRemoved.push(path);
      },
      async download() {
        return { status: 200, body: Buffer.from('image'), contentType: 'image/jpeg' };
      },
    },
    broadcastConversation(_conversation, event) {
      broadcasts.push(event);
    },
    memberStateEnabled: () => memberState,
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

test('upload direct signe seulement pour un participant et un type image', async () => {
  const harness = createHarness({ mediaEnabled: true });
  const result = await harness.writer.createAttachmentUpload({
    user,
    conversationId: 'conv-1',
    body: { mime: 'image/jpeg', size: 42_000 },
  });

  assert.equal(result.status, 200);
  assert.match(result.body.upload.storagePath, /^conversations\/conv-1\/att-/);
  assert.equal(result.body.upload.maxBytes, 700 * 1024);
  const reservation = harness.queries.find(({ sql }) => (
    sql.includes('insert into public.wigolink_runtime_records')
  ));
  assert.equal(reservation.params[0], result.body.upload.attachmentId);
});

test('message direct conserve uniquement la reference storage verifiee', async () => {
  const harness = createHarness({
    mediaEnabled: true,
    mediaInfo: { mime: 'image/jpeg', size: 42_000 },
  });
  const result = await harness.writer.send({
    user,
    conversationId: 'conv-1',
    body: {
      clientId: 'client-direct',
      attachments: [{
        id: 'att-12345678',
        name: 'preuve.jpg',
        mime: 'image/jpeg',
        storagePath: 'conversations/conv-1/att-12345678.jpg',
      }],
    },
    today: '2026-07-29',
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.message.attachments[0].size, 42_000);
  assert.equal(result.body.message.attachments[0].dataUrl, undefined);
  const insert = harness.queries.find(({ sql }) =>
    sql.includes('insert into public.messages')
  );
  const persisted = JSON.parse(insert.params[7]);
  assert.equal(
    persisted.attachments[0].storagePath,
    'conversations/conv-1/att-12345678.jpg',
  );
  assert.ok(harness.queries.some(({ sql, params }) => (
    sql.includes("kind = 'message_upload'")
    && sql.includes('delete')
    && params[0].includes('att-12345678')
  )));
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
  assert.equal(
    harness.queries.some(({ sql }) => sql.includes('insert into public.notifications')),
    false,
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

test('lecture relationnelle met a jour une seule ligne participant', async () => {
  const harness = createHarness({ memberState: true });
  const result = await harness.writer.markRead({
    user,
    conversationId: 'conv-1',
    today: '2026-07-29',
  });

  assert.equal(result.status, 200);
  assert.ok(harness.queries.some(({ sql }) =>
    sql.includes('update public.wigolink_conversation_members member')
    && sql.includes('last_read_at')
  ));
  assert.equal(harness.queries.some(({ sql }) =>
    sql.includes('update public.messages')
  ), false);
});

test('non lu relationnel place le curseur juste avant le dernier message recu', async () => {
  const latestIncomingAt = '2026-07-29T10:30:00.123456Z';
  const harness = createHarness({
    memberState: true,
    latestIncomingAt,
  });
  const result = await harness.writer.markUnread({
    user,
    conversationId: 'conv-1',
    today: '2026-07-29',
  });

  assert.equal(result.status, 200);
  const update = harness.queries.find(({ sql }) =>
    sql.includes('update public.wigolink_conversation_members')
    && sql.includes("interval '1 microsecond'")
  );
  assert.ok(update);
  assert.deepEqual(update.params, ['conv-1', 'u-1', latestIncomingAt]);
  assert.equal(harness.queries.some(({ sql }) =>
    sql.includes('update public.messages')
  ), false);
});

test('archives et epingles ne verrouillent plus la conversation partagee', async () => {
  const harness = createHarness({ memberState: true });
  const archived = await harness.writer.archive({
    user,
    conversationId: 'conv-1',
    active: true,
    today: '2026-07-29',
  });
  const pinned = await harness.writer.pin({
    user,
    conversationId: 'conv-1',
    active: true,
    today: '2026-07-29',
  });

  assert.equal(archived.status, 200);
  assert.equal(pinned.status, 200);
  assert.ok(harness.queries.some(({ sql }) =>
    sql.includes('set archived = $3')
  ));
  assert.ok(harness.queries.some(({ sql }) =>
    sql.includes('set pinned = $3')
  ));
  assert.equal(harness.queries.some(({ sql }) =>
    sql.includes('for update of c')
  ), false);
});

function createActionHarness(handler = async () => ({ rows: [], rowCount: 1 })) {
  const queries = [];
  let sequence = 0;
  const query = async (sql, params = []) => {
    queries.push({ sql, params });
    return handler(sql, params);
  };
  const client = { query, release() {} };
  const pool = {
    query,
    async connect() {
      return client;
    },
  };
  const writer = createRelationalMessageWriter({
    getPool: () => pool,
    getConversation: async ({ id }) => ({
      conversation: { id, participantIds: ['u-1', 'u-2'] },
    }),
    validPhotos: () => true,
    analyzeSafety: () => ({ blocked: false, categories: [], severity: 'none' }),
    safetyError: () => ({ error: 'blocked' }),
    messageMedia: { enabled: false },
    broadcastConversation() {},
    newId(prefix) {
      sequence += 1;
      return `${prefix}-${sequence}`;
    },
    now: () => 2_000,
    logger: { error() {} },
  });
  return { queries, writer };
}

test('creation relationnelle dedoublonne sous verrou sans charger l etat global', async () => {
  const harness = createActionHarness(async (sql) => {
    if (sql.includes('select 1 from public.wigolink_users')) {
      return { rows: [{ '?column?': 1 }], rowCount: 1 };
    }
    if (sql.includes('select id, data') && sql.includes('wigolink_conversations')) {
      return { rows: [], rowCount: 0 };
    }
    return { rows: [], rowCount: 1 };
  });
  const result = await harness.writer.createConversation({
    user,
    body: { userId: 'u-2' },
    today: '2026-07-29',
  });

  assert.equal(result.status, 200);
  assert.ok(harness.queries.some(({ sql }) => sql.includes('pg_advisory_xact_lock')));
  const insert = harness.queries.find(({ sql }) =>
    sql.includes('insert into public.wigolink_conversations')
  );
  const stored = JSON.parse(insert.params[1]);
  assert.deepEqual(stored.participantIds, ['u-1', 'u-2']);
  assert.deepEqual(stored.deletedBy, []);
});

test('creation relationnelle reutilise toujours la conversation unique de l operation', async () => {
  const existingConversation = {
    id: 'conv-operation',
    participantIds: ['u-1', 'u-2'],
    tripId: 't-1',
    operationId: 'tx-1',
    deletedBy: ['u-1'],
  };
  const harness = createActionHarness(async (sql) => {
    if (sql.includes('select data from public.wigolink_transactions')) {
      return {
        rows: [{ data: { id: 'tx-1', senderId: 'u-1', travelerId: 'u-2' } }],
        rowCount: 1,
      };
    }
    if (sql.includes('select 1 from public.wigolink_users')) {
      return { rows: [{ '?column?': 1 }], rowCount: 1 };
    }
    if (sql.includes("where data->>'operationId' = $1")) {
      return { rows: [{ id: existingConversation.id, data: existingConversation }], rowCount: 1 };
    }
    return { rows: [], rowCount: 1 };
  });

  const result = await harness.writer.createConversation({
    user,
    body: { operationId: 'tx-1' },
    today: '2026-07-29',
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.conversation.id, 'conv-operation');
  assert.ok(harness.queries.some(({ sql, params }) => (
    sql.includes('pg_advisory_xact_lock') && params[0] === 'operation:tx-1'
  )));
  assert.equal(harness.queries.some(({ sql }) => (
    sql.includes('insert into public.wigolink_conversations')
  )), false);
});

test('signalement relationnel conserve la preuve et la file de revue atomiquement', async () => {
  const harness = createActionHarness(async (sql) => {
    if (sql.includes('select c.data as conversation')) {
      return { rows: [contextRow], rowCount: 1 };
    }
    if (sql.includes('select 1 from public.wigolink_review_queue')) {
      return { rows: [], rowCount: 0 };
    }
    return { rows: [], rowCount: 1 };
  });
  const result = await harness.writer.reportConversation({
    user,
    conversationId: 'conv-1',
    body: {
      reasonCode: 'abuse',
      reason: 'Insultes',
      comment: 'Historique a verifier',
    },
    today: '2026-07-29',
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.report.reasonCode, 'abuse');
  assert.ok(harness.queries.some(({ sql }) =>
    sql.includes('insert into public.wigolink_conversation_reports')
  ));
  assert.ok(harness.queries.some(({ sql }) =>
    sql.includes('insert into public.wigolink_review_queue')
  ));
  assert.ok(harness.queries.some(({ sql }) =>
    sql.includes("'conversation.report'")
  ));
  assert.ok(harness.queries.some(({ sql }) => sql === 'commit'));
});

test('blocage relationnel met a jour membre, conversation et audit ensemble', async () => {
  const harness = createActionHarness(async (sql) => {
    if (sql.includes('select c.data as conversation')) {
      return { rows: [contextRow], rowCount: 1 };
    }
    if (sql.includes('select data from public.wigolink_users')) {
      return { rows: [{ data: { ...user, blockedUserIds: [] } }], rowCount: 1 };
    }
    return { rows: [], rowCount: 1 };
  });
  const result = await harness.writer.blockConversation({
    user,
    conversationId: 'conv-1',
    blocked: true,
    today: '2026-07-29',
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.blocked, true);
  const memberUpdate = harness.queries.find(({ sql }) =>
    sql.includes('update public.wigolink_users')
  );
  assert.deepEqual(JSON.parse(memberUpdate.params[1]).blockedUserIds, ['u-2']);
  assert.ok(harness.queries.some(({ sql }) =>
    sql.includes('update public.wigolink_conversations')
  ));
  assert.ok(harness.queries.some(({ sql }) =>
    sql.includes('insert into public.audit_logs')
  ));
});

test('comptes bloques relationnels restent bornes au membre et debloquables', async () => {
  const harness = createActionHarness(async (sql) => {
    if (sql.includes('select data from public.wigolink_users')) {
      return {
        rows: [{ data: { ...user, blockedUserIds: ['u-2'] } }],
        rowCount: 1,
      };
    }
    if (sql.includes('select id, data from public.wigolink_users')) {
      return {
        rows: [{ id: 'u-2', data: { id: 'u-2', name: 'Karim' } }],
        rowCount: 1,
      };
    }
    return { rows: [], rowCount: 1 };
  });

  const listed = await harness.writer.listBlocked({ user });
  assert.equal(listed.status, 200);
  assert.deepEqual(listed.body.users.map(({ id }) => id), ['u-2']);

  const unblocked = await harness.writer.unblockUser({
    user,
    otherId: 'u-2',
  });
  assert.equal(unblocked.status, 200);
  assert.ok(harness.queries.some(({ sql }) =>
    sql.includes("jsonb_array_elements_text")
  ));
  assert.ok(harness.queries.some(({ sql }) =>
    sql.includes("'user.unblock'")
    || (
      sql.includes('insert into public.audit_logs')
      && sql.includes('$2')
    )
  ));
});
