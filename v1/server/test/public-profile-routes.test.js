import assert from 'node:assert/strict';
import express from 'express';
import test from 'node:test';
import { createPublicProfilesRouter } from '../routes/public-profiles.js';

async function requestProfile({
  path,
  method = 'GET',
  body,
  auth = authenticated,
  publicProfiles,
}) {
  const app = express();
  app.use(express.json());
  app.use('/api', createPublicProfilesRouter({
    auth,
    publicProfiles,
  }));
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  try {
    const address = server.address();
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api${path}`,
      {
        method,
        headers: body ? { 'content-type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined,
      },
    );
    return {
      status: response.status,
      body: await response.json(),
    };
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

function authenticated(req, _res, next) {
  req.user = { id: 'sender' };
  next();
}

test('routes profils transmettent notation, avis et profil', async () => {
  const calls = [];
  const publicProfiles = {
    rate(id, user, body) {
      calls.push(['rate', id, user, body]);
      return { status: 200, body: { ok: true } };
    },
    reviews(id) {
      calls.push(['reviews', id]);
      return { status: 200, body: { reviews: [] } };
    },
    profile(id) {
      calls.push(['profile', id]);
      return { status: 200, body: { user: {} } };
    },
  };

  await requestProfile({
    path: '/transactions/tx-1/rate',
    method: 'POST',
    body: { targetId: 'traveler', stars: 5 },
    publicProfiles,
  });
  await requestProfile({
    path: '/users/traveler/reviews',
    publicProfiles,
  });
  await requestProfile({
    path: '/users/traveler',
    publicProfiles,
  });

  assert.deepEqual(calls, [
    [
      'rate',
      'tx-1',
      { id: 'sender' },
      { targetId: 'traveler', stars: 5 },
    ],
    ['reviews', 'traveler'],
    ['profile', 'traveler'],
  ]);
});

test('routes profils conservent les statuts du service', async () => {
  const response = await requestProfile({
    path: '/users/missing',
    publicProfiles: {
      profile() {
        return { status: 404, body: { error: 'Introuvable' } };
      },
    },
  });

  assert.equal(response.status, 404);
});

test('routes profils authentifient avant toute lecture', async () => {
  let calls = 0;
  const response = await requestProfile({
    path: '/users/traveler',
    auth(_req, res) {
      res.status(401).json({ error: 'Non authentifié' });
    },
    publicProfiles: {
      profile() {
        calls += 1;
      },
    },
  });

  assert.equal(response.status, 401);
  assert.equal(calls, 0);
});
