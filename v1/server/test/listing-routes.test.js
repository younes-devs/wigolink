import assert from 'node:assert/strict';
import express from 'express';
import test from 'node:test';
import { createListingsRouter } from '../routes/listings.js';

async function requestListing({
  method = 'GET',
  path = '/listings',
  body,
  auth = authenticated,
  listings,
}) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.lang = 'nl';
    next();
  });
  app.use('/api', createListingsRouter({ auth, listings }));
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

test('listing routes transmet filtres, membre et langue', async () => {
  const calls = [];
  const listings = {
    list(user, query, lang) {
      calls.push(['list', user, query, lang]);
      return { listings: [] };
    },
    mine(user, lang) {
      calls.push(['mine', user, lang]);
      return { listings: [{ id: 'l-1' }] };
    },
  };

  await requestListing({
    path: '/listings?q=diplome',
    listings,
  });
  await requestListing({
    path: '/listings/mine',
    listings,
  });

  assert.deepEqual(calls, [
    ['list', { id: 'u-1' }, { q: 'diplome' }, 'nl'],
    ['mine', { id: 'u-1' }, 'nl'],
  ]);
});

test('listing preflight conserve son enveloppe historique', async () => {
  const response = await requestListing({
    method: 'POST',
    path: '/listings/preflight',
    body: { title: 'Diplôme' },
    listings: {
      preflight(user, body, lang) {
        assert.deepEqual(user, { id: 'u-1' });
        assert.deepEqual(body, { title: 'Diplôme' });
        assert.equal(lang, 'nl');
        return { status: 'published' };
      },
    },
  });

  assert.deepEqual(response.body, {
    preflight: { status: 'published' },
  });
});

test('listing routes préservent les statuts des mutations', async () => {
  const calls = [];
  const listings = {
    async create(user, body, lang) {
      calls.push(['create', user, body, lang]);
      return {
        status: 201,
        body: { listing: { id: 'l-1' } },
      };
    },
    async update(id, user, body, lang) {
      calls.push(['update', id, user, body, lang]);
      return {
        status: 403,
        body: { error: 'Non autorisé' },
      };
    },
    async cancel(id, user, lang) {
      calls.push(['cancel', id, user, lang]);
      return {
        status: 200,
        body: { listing: { id, status: 'cancelled' } },
      };
    },
  };

  const created = await requestListing({
    method: 'POST',
    path: '/listings',
    body: { title: 'Diplôme' },
    listings,
  });
  const updated = await requestListing({
    method: 'PUT',
    path: '/listings/l-1',
    body: { title: 'Autre' },
    listings,
  });
  const cancelled = await requestListing({
    method: 'POST',
    path: '/listings/l-1/cancel',
    listings,
  });

  assert.equal(created.status, 201);
  assert.equal(updated.status, 403);
  assert.equal(cancelled.body.listing.status, 'cancelled');
  assert.deepEqual(calls, [
    ['create', { id: 'u-1' }, { title: 'Diplôme' }, 'nl'],
    ['update', 'l-1', { id: 'u-1' }, { title: 'Autre' }, 'nl'],
    ['cancel', 'l-1', { id: 'u-1' }, 'nl'],
  ]);
});

test('listing routes authentifient avant d appeler le service', async () => {
  let calls = 0;
  const response = await requestListing({
    path: '/listings',
    auth(_req, res) {
      res.status(401).json({ error: 'Non authentifié' });
    },
    listings: {
      list() {
        calls += 1;
      },
    },
  });

  assert.equal(response.status, 401);
  assert.equal(calls, 0);
});
