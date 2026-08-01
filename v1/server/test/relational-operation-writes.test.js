import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createRelationalOperationWriter,
  relationalOperationWritesEnabled,
} from '../relational-operation-writes.js';

test('ecritures operations relationnelles : option inactive par defaut', () => {
  assert.equal(relationalOperationWritesEnabled({}), false);
  assert.equal(relationalOperationWritesEnabled({
    RELATIONAL_OPERATION_WRITES: 'true',
  }), true);
});

test('acceptation relationnelle verrouille le trajet et cree operation plus conversation', async () => {
  const calls = [];
  const notifications = [];
  const client = mockClient(async (sql, params) => {
    calls.push({ sql, params });
    if (sql.includes('wigolink_trips') && sql.includes('for update')) {
      return {
        rows: [{
          data: {
            id: 't-1',
            travelerId: 'u-traveler',
            from: 'Oujda',
            to: 'Bruxelles',
            departureDate: '2026-08-20',
            capacityKg: 6,
            price: 30,
            currency: 'EUR',
            status: 'published',
          },
        }],
      };
    }
    if (sql.includes('select data from public.wigolink_transactions')) {
      return { rows: [] };
    }
    return { rows: [] };
  });
  const writer = writerHarness({
    client,
    notifications,
    calls,
    memberState: true,
  });

  const result = await writer.accept({
    user: verifiedUser(),
    tripId: 't-1',
    body: {
      shipmentType: 'parcel',
      weightKg: 3,
      descriptionParcel: 'Diplome',
    },
  });

  assert.equal(result.status, 200);
  assert.match(result.body.operation.id, /^tx-[0-9a-f-]{36}$/);
  assert.equal(result.body.operation.price, 15);
  assert.match(result.body.conversation.id, /^conv-[0-9a-f-]{36}$/);
  assert.ok(calls.some(({ sql }) => (
    sql.includes('wigolink_trips') && sql.includes('for update')
  )));
  assert.ok(calls.some(({ sql }) => sql.includes('insert into public.wigolink_transactions')));
  assert.ok(calls.some(({ sql }) => sql.includes('insert into public.wigolink_conversations')));
  assert.equal(calls.filter(({ sql }) =>
    sql.includes('insert into public.wigolink_conversation_members')
  ).length, 2);
  assert.equal(notifications.length, 1);
  assert.equal(client.released, 1);
});

test('acceptation relationnelle reutilise une demande active apres un retry', async () => {
  const calls = [];
  const existing = {
    id: 'tx-existing',
    tripId: 't-1',
    senderId: 'u-sender',
    travelerId: 'u-traveler',
    recipientId: 'u-sender',
    status: 'accepted',
    operationStatus: 'attente_confirmation',
  };
  const client = mockClient(async (sql) => {
    calls.push({ sql });
    if (sql.includes('wigolink_trips')) {
      return {
        rows: [{
          data: {
            id: 't-1',
            travelerId: 'u-traveler',
            departureDate: '2026-08-20',
            capacityKg: 6,
            price: 30,
          },
        }],
      };
    }
    if (sql.includes('select data from public.wigolink_transactions')) {
      return { rows: [{ data: existing }] };
    }
    if (sql.includes('select id from public.wigolink_conversations')) {
      return { rows: [{ id: 'conv-existing' }] };
    }
    return { rows: [] };
  });
  const writer = writerHarness({ client, calls });
  const result = await writer.accept({
    user: verifiedUser(),
    tripId: 't-1',
    body: { shipmentType: 'document', documentCount: 1 },
  });

  assert.equal(result.body.operation.id, 'tx-existing');
  assert.equal(result.body.conversation.id, 'conv-existing');
  assert.equal(calls.some(({ sql }) => sql.includes('insert into')), false);
});

test('transition relationnelle verrouille uniquement operation et persiste atomiquement', async () => {
  const calls = [];
  const tx = {
    id: 'tx-1',
    senderId: 'u-sender',
    travelerId: 'u-traveler',
    recipientId: 'u-sender',
    status: 'accepted',
    operationStatus: 'paiement_requis',
    paymentStatus: 'pending',
    escrow: { state: 'pending' },
    events: [],
  };
  const client = mockClient(async (sql, params) => {
    calls.push({ sql, params });
    if (sql.includes('wigolink_transactions') && sql.includes('for update')) {
      return { rows: [{ data: structuredClone(tx) }] };
    }
    return { rows: [] };
  });
  const writer = writerHarness({ client, calls });
  const result = await writer.pay({
    user: verifiedUser(),
    operationId: 'tx-1',
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.operation.operationStatus, 'paye');
  assert.ok(calls.some(({ sql }) => (
    sql.includes('wigolink_transactions') && sql.includes('for update')
  )));
  const update = calls.find(({ sql }) => sql.includes('update public.wigolink_transactions'));
  assert.equal(JSON.parse(update.params[1]).paymentStatus, 'paid');
  assert.equal(client.transactions, 'begin,commit');
});

function writerHarness({ client, notifications = [], memberState = false }) {
  let latestOperation = null;
  const originalQuery = client.query;
  client.query = async (sql, params = []) => {
    const result = await originalQuery(sql, params);
    if (sql.includes('insert into public.wigolink_transactions')) {
      latestOperation = JSON.parse(params[1]);
    }
    if (sql.includes('update public.wigolink_transactions')) {
      latestOperation = JSON.parse(params[1]);
    }
    return result;
  };
  return createRelationalOperationWriter({
    getPool: () => ({
      connect: async () => client,
    }),
    async getOperation({ id }) {
      return {
        status: 200,
        body: {
          operation: latestOperation || {
            id,
            senderId: 'u-sender',
            travelerId: 'u-traveler',
            operationStatus: id === 'tx-1' ? 'paye' : 'attente_confirmation',
          },
        },
      };
    },
    async getConversation({ id }) {
      return { conversation: { id } };
    },
    operationCodePublicState: () => ({}),
    disputeView: (value) => value,
    createEscrow: ({ travelerPay, commission }) => ({
      state: 'held',
      travelerPay,
      commission,
    }),
    transitionEscrow: (escrow, state) => {
      escrow.state = state;
    },
    issueOperationCode: () => '12345678',
    verifyOperationCode: () => ({ ok: true }),
    async notify(...args) {
      notifications.push(args);
    },
    async audit() {},
    validPhotos: () => true,
    today: () => '2026-07-29',
    now: () => 1_785_312_000_000,
    logger: { error() {} },
    memberStateEnabled: () => memberState,
  });
}

function mockClient(handler) {
  const client = {
    released: 0,
    transactions: '',
    async query(sql, params = []) {
      const normalized = String(sql).trim().toLowerCase();
      if (normalized === 'begin' || normalized === 'commit' || normalized === 'rollback') {
        if (normalized !== 'rollback' || client.transactions !== 'begin,commit') {
          client.transactions = [client.transactions, normalized].filter(Boolean).join(',');
        }
        return { rows: [] };
      }
      return handler(String(sql), params);
    },
    release() {
      client.released += 1;
    },
  };
  return client;
}

function verifiedUser() {
  return {
    id: 'u-sender',
    name: 'Younes',
    kycStatus: 'verified',
  };
}
