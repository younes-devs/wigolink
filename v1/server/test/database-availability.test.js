import assert from 'node:assert/strict';
import test from 'node:test';
import { createDatabaseAvailability } from '../middleware/database-availability.js';

function runMiddleware({
  isProduction = true,
  health = 'connected',
  path = '/api/trips',
} = {}) {
  let healthCalls = 0;
  let nextCalled = false;
  let responseStatus;
  let responseBody;
  const middleware = createDatabaseAvailability({
    isProduction,
    databaseHealth() {
      healthCalls += 1;
      return health;
    },
  });
  const res = {
    status(status) {
      responseStatus = status;
      return this;
    },
    json(body) {
      responseBody = body;
      return this;
    },
  };

  middleware({ path }, res, () => {
    nextCalled = true;
  });

  return {
    healthCalls,
    nextCalled,
    responseStatus,
    responseBody,
  };
}

test('database availability laisse passer le developpement sans interroger la base', () => {
  const result = runMiddleware({
    isProduction: false,
    health: 'unavailable',
  });

  assert.equal(result.healthCalls, 0);
  assert.equal(result.nextCalled, true);
  assert.equal(result.responseStatus, undefined);
});

test('database availability laisse passer une base disponible en production', () => {
  const result = runMiddleware();

  assert.equal(result.healthCalls, 1);
  assert.equal(result.nextCalled, true);
  assert.equal(result.responseStatus, undefined);
});

test('database availability garde le healthcheck accessible en production', () => {
  const result = runMiddleware({
    health: 'unavailable',
    path: '/api/health',
  });

  assert.equal(result.healthCalls, 1);
  assert.equal(result.nextCalled, true);
  assert.equal(result.responseStatus, undefined);
});

test('database availability renvoie le meme 503 si la base est indisponible', () => {
  const result = runMiddleware({ health: 'unavailable' });

  assert.equal(result.healthCalls, 1);
  assert.equal(result.nextCalled, false);
  assert.equal(result.responseStatus, 503);
  assert.deepEqual(result.responseBody, {
    error: 'Base de donnees indisponible. Reessayez plus tard.',
  });
});
