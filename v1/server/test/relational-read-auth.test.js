import assert from 'node:assert/strict';
import test from 'node:test';
import { createRelationalReadAuth } from '../middleware/relational-read-auth.js';

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

function createHarness(overrides = {}) {
  const events = [];
  const pool = { name: 'pool' };
  const middleware = createRelationalReadAuth({
    enabled: () => true,
    getPool: () => pool,
    async findUserFromSession(payload) {
      events.push(['find', payload]);
      return { id: 'u-1', email: 'membre@example.test', emailVerified: true };
    },
    async getSession(token) {
      return { token };
    },
    canAccessApp(user) {
      return user.emailVerified === true;
    },
    logger: {
      error(...args) {
        events.push(['error', ...args]);
      },
    },
    ...overrides,
  });
  return {
    events,
    middleware,
    pool,
  };
}

test('relational auth passe a la route historique quand la migration est inactive', async () => {
  let poolCalls = 0;
  const { middleware } = createHarness({
    enabled: () => false,
    getPool() {
      poolCalls += 1;
    },
  });
  let nextValue;

  await middleware({ headers: {} }, response(), (value) => {
    nextValue = value;
  });

  assert.equal(nextValue, 'route');
  assert.equal(poolCalls, 0);
});

test('relational auth refuse une base absente avant de lire la session', async () => {
  let userCalls = 0;
  const { middleware } = createHarness({
    getPool: () => null,
    findUserFromSession() {
      userCalls += 1;
    },
  });
  const res = response();

  await middleware({ headers: {} }, res, () => {});

  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.body, {
    error: 'Base de donnees temporairement indisponible.',
  });
  assert.equal(userCalls, 0);
});

test('relational auth extrait le bearer et refuse une session inconnue', async () => {
  let received;
  const { middleware, pool } = createHarness({
    async findUserFromSession(payload) {
      received = payload;
      return null;
    },
  });
  const res = response();

  await middleware({
    headers: { authorization: 'Bearer secret-token' },
  }, res, () => {});

  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, {
    error: 'Utilisateur inconnu ou session expiree',
  });
  assert.equal(received.token, 'secret-token');
  assert.equal(received.pool, pool);
  assert.equal(typeof received.getSession, 'function');
});

test('relational auth conserve le blocage email avant l acces', async () => {
  const user = {
    id: 'u-1',
    email: 'membre@example.test',
    emailVerified: false,
  };
  const { middleware } = createHarness({
    async findUserFromSession() {
      return user;
    },
  });
  const res = response();

  await middleware({ headers: {} }, res, () => {});

  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, {
    needsVerification: true,
    pendingEmail: user.email,
    error: 'Verifiez votre adresse email avant d acceder a l application.',
  });
});

test('relational auth attache le membre valide puis poursuit', async () => {
  const user = {
    id: 'u-1',
    emailVerified: true,
  };
  const { middleware } = createHarness({
    async findUserFromSession() {
      return user;
    },
  });
  const req = { headers: {} };
  let nextCalls = 0;

  await middleware(req, response(), () => {
    nextCalls += 1;
  });

  assert.equal(req.user, user);
  assert.equal(nextCalls, 1);
});

test('relational auth transforme une panne de lecture en 503', async () => {
  const failure = new Error('database timeout');
  const { events, middleware } = createHarness({
    async findUserFromSession() {
      throw failure;
    },
  });
  const res = response();

  await middleware({ headers: {} }, res, () => {});

  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.body, {
    error: 'Recherche temporairement indisponible. Reessayez.',
  });
  assert.deepEqual(events, [[
    'error',
    'Echec de lecture relationnelle des trajets',
    failure,
  ]]);
});
