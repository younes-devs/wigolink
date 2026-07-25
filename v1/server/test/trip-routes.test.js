import assert from 'node:assert/strict';
import express from 'express';
import test from 'node:test';
import { createTripsRouter } from '../routes/trips.js';

async function requestTrip({
  method = 'GET',
  path = '/trips',
  body,
  auth,
  trips,
  fallback = false,
}) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.lang = 'ar';
    next();
  });
  app.use('/api', createTripsRouter({ auth, trips }));
  if (fallback) {
    app.get(`/api${path}`, (_req, res) => {
      res.json({ fallback: true });
    });
  }
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });

  try {
    const address = server.address();
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api${path}`,
      {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      },
    );
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

function authenticated(req, _res, next) {
  req.user = { id: 'u-1' };
  next();
}

test('trip routes transmet lecture et mutation au service', async () => {
  const calls = [];
  const trips = {
    list(user, query) {
      calls.push(['list', user, query]);
      return { trips: [] };
    },
    async create(user, body) {
      calls.push(['create', user, body]);
      return {
        status: 201,
        body: { trip: { id: 't-1' } },
      };
    },
  };

  const list = await requestTrip({
    path: '/trips?from=Oujda',
    auth: authenticated,
    trips,
  });
  assert.deepEqual(list.body, { trips: [] });

  const created = await requestTrip({
    method: 'POST',
    path: '/trips',
    body: { from: 'Oujda' },
    auth: authenticated,
    trips,
  });
  assert.equal(created.status, 201);
  assert.deepEqual(calls, [
    ['list', { id: 'u-1' }, { from: 'Oujda' }],
    ['create', { id: 'u-1' }, { from: 'Oujda' }],
  ]);
});

test('trip routes transmet mission, membre et langue au service', async () => {
  const calls = [];
  const response = await requestTrip({
    path: '/trips/mission',
    auth: authenticated,
    trips: {
      mission(user, lang) {
        calls.push([user, lang]);
        return {
          missions: [],
          totals: { trips: 0, matches: 0, potentialPay: 0 },
        };
      },
    },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body.missions, []);
  assert.deepEqual(calls, [[{ id: 'u-1' }, 'ar']]);
});

test('trip routes conserve statut service et protege avant appel', async () => {
  const refused = await requestTrip({
    method: 'PATCH',
    path: '/trips/t-1',
    body: { price: 30 },
    auth: authenticated,
    trips: {
      async update() {
        return {
          status: 400,
          body: { error: 'Trajet indisponible' },
        };
      },
    },
  });
  assert.equal(refused.status, 400);

  let calls = 0;
  const unauthorized = await requestTrip({
    auth(_req, res) {
      res.status(401).json({ error: 'Non authentifie' });
    },
    trips: {
      list() {
        calls += 1;
      },
    },
  });
  assert.equal(unauthorized.status, 401);
  assert.equal(calls, 0);
});

test('trip routes transmet les favoris et leur suppression', async () => {
  const calls = [];
  const trips = {
    saveTrip(id, user) {
      calls.push(['save', id, user]);
      return {
        status: 200,
        body: { trip: { id } },
      };
    },
    unsaveTrip(id, user) {
      calls.push(['remove', id, user]);
      return { ok: true };
    },
  };

  await requestTrip({
    method: 'POST',
    path: '/saved-trips/t-1',
    auth: authenticated,
    trips,
  });
  await requestTrip({
    method: 'DELETE',
    path: '/saved-trips/t-1',
    auth: authenticated,
    trips,
  });
  assert.deepEqual(calls, [
    ['save', 't-1', { id: 'u-1' }],
    ['remove', 't-1', { id: 'u-1' }],
  ]);
});
