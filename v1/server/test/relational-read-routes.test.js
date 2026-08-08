import assert from 'node:assert/strict';
import express from 'express';
import test from 'node:test';
import { createRelationalReadsRouter } from '../routes/relational-reads.js';

function createDependencies(overrides = {}) {
  const calls = [];
  const pool = { name: 'pool' };
  return {
    calls,
    pool,
    dependencies: {
      auth(req, _res, next) {
        req.user = { id: 'u-1' };
        next();
      },
      tripReadsEnabled: () => true,
      messageReadsEnabled: () => true,
      getPool: () => pool,
      async listTrips(payload) {
        calls.push(['trips', payload]);
        return { trips: [{ id: 't-1' }] };
      },
      async listConversations(payload) {
        calls.push(['conversations', payload]);
        return { conversations: [{ id: 'conv-1' }] };
      },
      async getConversation(payload) {
        calls.push(['conversation', payload]);
        return { conversation: { id: payload.id } };
      },
      today: () => '2026-07-25',
      logger: {
        error(...args) {
          calls.push(['error', ...args]);
        },
      },
      ...overrides,
    },
  };
}

async function requestRoute({
  path,
  dependencies,
}) {
  const app = express();
  app.use('/api', createRelationalReadsRouter(dependencies));
  app.get(`/api${path.split('?')[0]}`, (_req, res) => {
    res.json({ fallback: true });
  });
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });

  try {
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/api${path}`);
    return {
      status: response.status,
      body: await response.json(),
    };
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
}

test('relational reads laisse les routes historiques reprendre quand desactive', async () => {
  const trips = createDependencies({
    tripReadsEnabled: () => false,
  });
  const tripResponse = await requestRoute({
    path: '/trips?from=Oujda',
    dependencies: trips.dependencies,
  });
  assert.deepEqual(tripResponse.body, { fallback: true });
  assert.deepEqual(trips.calls, []);

  const messages = createDependencies({
    messageReadsEnabled: () => false,
  });
  const messageResponse = await requestRoute({
    path: '/conversations',
    dependencies: messages.dependencies,
  });
  assert.deepEqual(messageResponse.body, { fallback: true });
  assert.deepEqual(messages.calls, []);
});

test('relational reads transmet les filtres des trajets et le scope mine', async () => {
  const mine = createDependencies();
  const response = await requestRoute({
    path: '/trips/mine?from=Oujda&limit=20',
    dependencies: mine.dependencies,
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    trips: [{ id: 't-1' }],
  });
  assert.deepEqual(mine.calls[0], [
    'trips',
    {
      pool: mine.pool,
      user: { id: 'u-1' },
      query: { from: 'Oujda', limit: '20' },
      mine: true,
      today: '2026-07-25',
    },
  ]);

  const feed = createDependencies();
  await requestRoute({
    path: '/trips?to=Bruxelles',
    dependencies: feed.dependencies,
  });
  assert.deepEqual(feed.calls[0][1], {
    pool: feed.pool,
    user: { id: 'u-1' },
    query: { to: 'Bruxelles' },
    today: '2026-07-25',
  });
});

test('relational reads sert le catalogue public sans appeler auth', async () => {
  let authCalls = 0;
  const harness = createDependencies({
    auth(_req, res) {
      authCalls += 1;
      res.status(401).json({ error: 'Authentification requise' });
    },
    async listTrips(payload) {
      harness.calls.push(['trips', payload]);
      return {
        trips: [{
          id: 't-public',
          from: 'Oujda',
          to: 'Bruxelles',
          date: '2026-08-20',
          traveler: { id: 'u-2', name: 'Karim', email: 'private@example.com' },
        }],
      };
    },
  });
  const response = await requestRoute({
    path: '/public/trips?q=wjda&limit=12',
    dependencies: harness.dependencies,
  });

  assert.equal(response.status, 200);
  assert.equal(authCalls, 0);
  assert.deepEqual(harness.calls[0], [
    'trips',
    {
      pool: harness.pool,
      user: null,
      query: { q: 'wjda', limit: '12' },
      today: '2026-07-25',
    },
  ]);
  assert.equal(response.body.trips[0].id, 't-public');
  assert.equal('email' in response.body.trips[0].traveler, false);
});

test('relational reads sert le detail public avec un utilisateur anonyme', async () => {
  let authCalls = 0;
  const harness = createDependencies({
    auth(_req, res) {
      authCalls += 1;
      res.status(401).json({ error: 'Authentification requise' });
    },
    async getTrip(payload) {
      harness.calls.push(['trip', payload]);
      return {
        status: 200,
        body: {
          trip: {
            id: payload.id,
            from: 'Oujda',
            to: 'Paris',
            date: '2026-08-20',
            traveler: { id: 'u-2', name: 'Karim', email: 'private@example.com' },
          },
        },
      };
    },
  });
  const response = await requestRoute({
    path: '/public/trips/t-public',
    dependencies: harness.dependencies,
  });

  assert.equal(response.status, 200);
  assert.equal(authCalls, 0);
  assert.deepEqual(harness.calls[0], [
    'trip',
    {
      pool: harness.pool,
      user: null,
      id: 't-public',
      today: '2026-07-25',
    },
  ]);
  assert.equal('email' in response.body.trip.traveler, false);
});

test('relational reads construit l apercu depuis feed et mes trajets', async () => {
  const harness = createDependencies({
    async listTrips(payload) {
      harness.calls.push(['trips', payload]);
      return payload.mine
        ? { trips: [{ id: 'mine' }], page: { hasMore: false } }
        : { trips: [{ id: 'feed' }], page: { hasMore: true, nextOffset: 40 } };
    },
  });
  const response = await requestRoute({
    path: '/trips/overview?q=valise',
    dependencies: harness.dependencies,
  });

  assert.deepEqual(response.body, {
    trips: [{ id: 'feed' }],
    myTrips: [{ id: 'mine' }],
    pages: {
      trips: { hasMore: true, nextOffset: 40 },
      myTrips: { hasMore: false },
    },
  });
  assert.equal(harness.calls.length, 2);
  assert.deepEqual(harness.calls[0][1].query, {
    q: 'valise',
    excludeMine: '1',
  });
  assert.deepEqual(harness.calls[1][1].query, {
    q: 'valise',
  });
  assert.equal(harness.calls[1][1].mine, true);
});

test('relational reads sert liste, detail et page de messages', async () => {
  const list = createDependencies();
  const listResponse = await requestRoute({
    path: '/conversations?filter=unread',
    dependencies: list.dependencies,
  });
  assert.deepEqual(listResponse.body, {
    conversations: [{ id: 'conv-1' }],
  });
  assert.deepEqual(list.calls[0][1], {
    pool: list.pool,
    user: { id: 'u-1' },
    query: { filter: 'unread' },
    today: '2026-07-25',
  });

  const detail = createDependencies();
  await requestRoute({
    path: '/conversations/conv-9',
    dependencies: detail.dependencies,
  });
  assert.deepEqual(detail.calls[0][1], {
    pool: detail.pool,
    user: { id: 'u-1' },
    id: 'conv-9',
    today: '2026-07-25',
  });

  const messages = createDependencies();
  await requestRoute({
    path: '/conversations/conv-9/messages?before=100&limit=50',
    dependencies: messages.dependencies,
  });
  assert.deepEqual(messages.calls[0][1], {
    pool: messages.pool,
    user: { id: 'u-1' },
    id: 'conv-9',
    query: { before: '100', limit: '50' },
    today: '2026-07-25',
    includeMessages: true,
  });
});

test('relational reads conserve les 404 de conversation', async () => {
  const harness = createDependencies({
    async getConversation() {
      return null;
    },
  });

  const detail = await requestRoute({
    path: '/conversations/missing',
    dependencies: harness.dependencies,
  });
  assert.equal(detail.status, 404);
  assert.deepEqual(detail.body, {
    error: 'Conversation introuvable',
  });

  const messages = await requestRoute({
    path: '/conversations/missing/messages',
    dependencies: harness.dependencies,
  });
  assert.equal(messages.status, 404);
  assert.deepEqual(messages.body, {
    error: 'Conversation introuvable',
  });
});

test('relational reads conserve les erreurs publiques sans exposer la panne', async () => {
  const failure = new Error('query failed');
  const harness = createDependencies({
    async listTrips() {
      throw failure;
    },
    async getConversation() {
      throw failure;
    },
  });

  const trips = await requestRoute({
    path: '/trips',
    dependencies: harness.dependencies,
  });
  assert.equal(trips.status, 503);
  assert.deepEqual(trips.body, {
    error: 'Recherche temporairement indisponible. Reessayez.',
  });

  const messages = await requestRoute({
    path: '/conversations/conv-1/messages',
    dependencies: harness.dependencies,
  });
  assert.equal(messages.status, 503);
  assert.deepEqual(messages.body, {
    error: 'Messages temporairement indisponibles. Reessayez.',
  });
  assert.equal(harness.calls.filter(([type]) => type === 'error').length, 2);
});
