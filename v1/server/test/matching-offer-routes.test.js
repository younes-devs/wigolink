import assert from 'node:assert/strict';
import express from 'express';
import test from 'node:test';
import { createMatchingOffersRouter } from '../routes/matching-offers.js';

async function requestMatching({
  method = 'GET',
  path = '/matching-offers',
  body,
  auth = authenticated,
  matchingOffers,
}) {
  const app = express();
  app.use(express.json());
  app.use('/api', createMatchingOffersRouter({
    auth,
    matchingOffers,
  }));
  const server = await new Promise((resolve) => {
    const listening = app.listen(
      0,
      '127.0.0.1',
      () => resolve(listening),
    );
  });

  try {
    const address = server.address();
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api${path}`,
      {
        method,
        headers: { 'Content-Type': 'application/json' },
        body:
          body === undefined
            ? undefined
            : JSON.stringify(body),
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

test('matching routes transmettent centre, liste et création', async () => {
  const calls = [];
  const matchingOffers = {
    async center(user) {
      calls.push(['center', user]);
      return { matching: { items: [] } };
    },
    async list(user) {
      calls.push(['list', user]);
      return { offers: [] };
    },
    async create(user, body) {
      calls.push(['create', user, body]);
      return {
        status: 201,
        body: { offer: { id: 'mo-1' } },
      };
    },
  };

  await requestMatching({
    path: '/sender-matching',
    matchingOffers,
  });
  await requestMatching({ matchingOffers });
  const created = await requestMatching({
    method: 'POST',
    body: { listingId: 'l-1' },
    matchingOffers,
  });

  assert.equal(created.status, 201);
  assert.deepEqual(calls, [
    ['center', { id: 'u-1' }],
    ['list', { id: 'u-1' }],
    ['create', { id: 'u-1' }, { listingId: 'l-1' }],
  ]);
});

test('matching routes transmettent les trois décisions non financières', async () => {
  const calls = [];
  const matchingOffers = {
    async decline(id, user) {
      calls.push(['decline', id, user]);
      return { status: 200, body: { offer: { status: 'declined' } } };
    },
    async withdraw(id, user) {
      calls.push(['withdraw', id, user]);
      return { status: 200, body: { offer: { status: 'withdrawn' } } };
    },
    async counter(id, user, body) {
      calls.push(['counter', id, user, body]);
      return {
        status: 200,
        body: { offer: { status: 'countered_sender' } },
      };
    },
  };

  await requestMatching({
    method: 'POST',
    path: '/matching-offers/mo-1/decline',
    matchingOffers,
  });
  await requestMatching({
    method: 'POST',
    path: '/matching-offers/mo-1/withdraw',
    matchingOffers,
  });
  await requestMatching({
    method: 'POST',
    path: '/matching-offers/mo-1/counter',
    body: { offeredPay: 20 },
    matchingOffers,
  });

  assert.deepEqual(calls, [
    ['decline', 'mo-1', { id: 'u-1' }],
    ['withdraw', 'mo-1', { id: 'u-1' }],
    ['counter', 'mo-1', { id: 'u-1' }, { offeredPay: 20 }],
  ]);
});

test('matching routes gardent statut service et auth préalable', async () => {
  let serviceCalls = 0;
  const forbidden = await requestMatching({
    method: 'POST',
    path: '/matching-offers/mo-1/decline',
    matchingOffers: {
      async decline() {
        return {
          status: 403,
          body: { error: 'Interdit' },
        };
      },
    },
  });
  const unauthorized = await requestMatching({
    auth(_req, res) {
      res.status(401).json({ error: 'Non authentifié' });
    },
    matchingOffers: {
      async list() {
        serviceCalls += 1;
      },
    },
  });

  assert.equal(forbidden.status, 403);
  assert.equal(unauthorized.status, 401);
  assert.equal(serviceCalls, 0);
});
