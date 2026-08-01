import assert from 'node:assert/strict';
import express from 'express';
import test from 'node:test';
import { createSystemRouter } from '../routes/system.js';

const FIXED_DATE = new Date('2026-07-25T12:00:00.000Z');

async function requestSystem(path, options = {}) {
  const app = express();
  app.use('/api', createSystemRouter({
    demo: false,
    isProduction: false,
    emailReady: false,
    databaseHealth: () => 'local',
    now: () => FIXED_DATE,
    ...options,
  }));
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

test('system routes exposent seulement la configuration publique du navigateur', async () => {
  const response = await requestSystem('/config', {
    demo: true,
    googleClientId: 'client-public.apps.googleusercontent.com',
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    demo: true,
    googleClientId: 'client-public.apps.googleusercontent.com',
  });
});

test('system routes considerent le stockage local pret hors production', async () => {
  const response = await requestSystem('/health');

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    ok: true,
    database: 'local',
    email: 'missing',
    storage: 'missing',
    at: FIXED_DATE.toISOString(),
  });
});

test('system routes exigent la configuration email en production', async () => {
  const response = await requestSystem('/health', {
    isProduction: true,
    databaseHealth: () => 'connected',
  });

  assert.equal(response.status, 503);
  assert.deepEqual(response.body, {
    ok: false,
    database: 'connected',
    email: 'missing',
    storage: 'missing',
    at: FIXED_DATE.toISOString(),
  });
});

test('system routes refusent une base indisponible meme avec l email configure', async () => {
  const response = await requestSystem('/health', {
    isProduction: true,
    emailReady: true,
    databaseHealth: () => 'unavailable',
  });

  assert.equal(response.status, 503);
  assert.deepEqual(response.body, {
    ok: false,
    database: 'unavailable',
    email: 'configured',
    storage: 'missing',
    at: FIXED_DATE.toISOString(),
  });
});

test('system routes declarent la production prete quand ses dependances le sont', async () => {
  const response = await requestSystem('/health', {
    isProduction: true,
    emailReady: true,
    storageReady: true,
    databaseHealth: () => 'connected',
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    ok: true,
    database: 'connected',
    email: 'configured',
    storage: 'configured',
    at: FIXED_DATE.toISOString(),
  });
});
