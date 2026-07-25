import assert from 'node:assert/strict';
import express from 'express';
import test from 'node:test';
import { createGuidanceCentersRouter } from '../routes/guidance-centers.js';

async function requestCenter({
  path,
  auth = authenticated,
  guidanceCenters,
}) {
  const app = express();
  app.use((req, _res, next) => {
    req.lang = 'ar';
    next();
  });
  app.use('/api', createGuidanceCentersRouter({
    auth,
    guidanceCenters,
  }));
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  try {
    const address = server.address();
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api${path}`,
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
  req.user = { id: 'u-1' };
  next();
}

test('routes centres transmettent membre et langue', async () => {
  const calls = [];
  const guidanceCenters = {
    documents(user) {
      calls.push(['documents', user]);
      return { dossiers: [] };
    },
    compliance(user, lang) {
      calls.push(['compliance', user, lang]);
      return { corridors: [] };
    },
    support(user) {
      calls.push(['support', user]);
      return { cases: [] };
    },
  };

  const documents = await requestCenter({
    path: '/documents-center',
    guidanceCenters,
  });
  const compliance = await requestCenter({
    path: '/compliance-center',
    guidanceCenters,
  });
  const support = await requestCenter({
    path: '/support-center',
    guidanceCenters,
  });

  assert.deepEqual(documents.body.documents.dossiers, []);
  assert.deepEqual(compliance.body.compliance.corridors, []);
  assert.deepEqual(support.body.support.cases, []);
  assert.deepEqual(calls, [
    ['documents', { id: 'u-1' }],
    ['compliance', { id: 'u-1' }, 'ar'],
    ['support', { id: 'u-1' }],
  ]);
});

test('routes centres authentifient avant le service', async () => {
  let calls = 0;
  const response = await requestCenter({
    path: '/support-center',
    auth(_req, res) {
      res.status(401).json({ error: 'Non authentifié' });
    },
    guidanceCenters: {
      support() {
        calls += 1;
      },
    },
  });

  assert.equal(response.status, 401);
  assert.equal(calls, 0);
});
