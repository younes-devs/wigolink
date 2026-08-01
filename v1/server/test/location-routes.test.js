import assert from 'node:assert/strict';
import express from 'express';
import test from 'node:test';
import { createLocationsRouter } from '../routes/locations.js';

async function requestLocation(path, {
  auth = authenticated,
  suggest = () => [],
  findById = () => null,
  stats = () => ({ countryCode: 'MA', locations: 482, names: 0 }),
} = {}) {
  const app = express();
  app.use('/api', createLocationsRouter({ auth, suggest, findById, stats }));
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });

  try {
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/api${path}`);
    return { status: response.status, body: await response.json() };
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

function authenticated(req, _res, next) {
  req.user = { id: 'u-1' };
  next();
}

test('location routes transmet requete, pays et limite au moteur', async () => {
  const calls = [];
  const response = await requestLocation('/locations/suggest?q=wjda&country=ma&limit=4', {
    suggest(query, options) {
      calls.push([query, options]);
      return [{ id: 'ma-2540483', name: 'Oujda', countryCode: 'MA' }];
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.locations[0].name, 'Oujda');
  assert.deepEqual(calls, [['wjda', { countryCode: 'MA', limit: '4' }]]);
});

test('location routes expose fiche et statistiques du catalogue', async () => {
  const location = await requestLocation('/locations/ma-2540483', {
    findById(id, country) {
      assert.equal(id, 'ma-2540483');
      assert.equal(country, 'MA');
      return { id, name: 'Oujda', countryCode: country };
    },
  });
  assert.equal(location.status, 200);
  assert.equal(location.body.location.name, 'Oujda');

  const catalog = await requestLocation('/locations');
  assert.equal(catalog.status, 200);
  assert.equal(catalog.body.catalog.locations, 482);
});

test('les suggestions publiques restent disponibles sans authentification', async () => {
  let authCalls = 0;
  const response = await requestLocation('/locations/suggest?q=wjda', {
    auth(_req, res) {
      authCalls += 1;
      res.status(401).json({ error: 'Authentification requise' });
    },
    suggest() {
      return [{ id: 'ma-2540483', name: 'Oujda', countryCode: 'MA' }];
    },
  });
  assert.equal(response.status, 200);
  assert.equal(authCalls, 0);
  assert.equal(response.body.locations[0].name, 'Oujda');

  const privateLocation = await requestLocation('/locations/ma-2540483', {
    auth(_req, res) {
      res.status(401).json({ error: 'Authentification requise' });
    },
  });
  assert.equal(privateLocation.status, 401);
});
