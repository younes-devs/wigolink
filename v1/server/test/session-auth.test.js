import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionAuth } from '../middleware/session-auth.js';

function createResponse() {
  return {
    statusCode: 200,
    body: undefined,
    headersSent: false,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      this.headersSent = true;
      return this;
    },
    send(body) {
      this.body = body;
      this.headersSent = true;
      return this;
    },
  };
}

function createHarness({
  sessions = new Map(),
  users = new Map(),
  getPersistentSession,
  findUser,
  persistUser,
} = {}) {
  const deletedTokens = [];
  const logs = [];
  let saveCalls = 0;
  const sessionAuth = createSessionAuth({
    getPersistentSession: getPersistentSession || (async (token) => sessions.get(token)),
    async deletePersistentSession(token) {
      deletedTokens.push(token);
      sessions.delete(token);
    },
    findUser: findUser || ((id) => users.get(id)),
    persistUser,
    canAccessApp: (user) => !!user && (
      user.emailVerified === true || user.provider === 'google'
    ),
    save() {
      saveCalls += 1;
    },
    now: () => 1_000,
    logger: {
      error(message) {
        logs.push(message);
      },
    },
  });

  return {
    deletedTokens,
    logs,
    sessionAuth,
    get saveCalls() {
      return saveCalls;
    },
  };
}

function request(token, query = {}) {
  return {
    headers: token ? { authorization: `Bearer ${token}` } : {},
    query,
  };
}

test('session auth conserve une session persistante encore valide', async () => {
  const sessions = new Map([
    ['valid-token', { userId: 'u-1', expiresAt: 2_000 }],
  ]);
  const harness = createHarness({ sessions });

  assert.deepEqual(
    await harness.sessionAuth.activeSession('valid-token'),
    { userId: 'u-1', expiresAt: 2_000 },
  );
  assert.deepEqual(harness.deletedTokens, []);
});

test('session auth supprime une session expiree', async () => {
  const sessions = new Map([
    ['expired-token', { userId: 'u-1', expiresAt: 1_000 }],
  ]);
  const harness = createHarness({ sessions });

  assert.equal(await harness.sessionAuth.activeSession('expired-token'), null);
  assert.deepEqual(harness.deletedTokens, ['expired-token']);
});

test('session auth refuse un bearer token absent ou inconnu', async () => {
  const harness = createHarness();
  const res = createResponse();
  let nextCalled = false;

  await harness.sessionAuth.auth(request(), res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { error: 'Non authentifié' });
});

test('session auth attache le membre valide a la requete', async () => {
  const user = { id: 'u-1', emailVerified: true };
  const sessions = new Map([
    ['valid-token', { userId: user.id, expiresAt: 2_000 }],
  ]);
  const users = new Map([[user.id, user]]);
  const harness = createHarness({ sessions, users });
  const req = request('valid-token');
  const res = createResponse();
  let nextCalled = false;

  await harness.sessionAuth.auth(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(req.user, user);
  assert.equal(res.statusCode, 200);
});

test('session auth accepte une recherche utilisateur asynchrone', async () => {
  const user = { id: 'u-1', emailVerified: true };
  const sessions = new Map([
    ['valid-token', { userId: user.id, expiresAt: 2_000 }],
  ]);
  const users = new Map([[user.id, user]]);
  const harness = createHarness({
    sessions,
    users,
    findUser: async (id) => users.get(id),
  });
  const req = request('valid-token');
  const res = createResponse();

  await harness.sessionAuth.auth(req, res, () => {});

  assert.equal(req.user, user);
});

test('session auth persiste uniquement apres une mutation du membre', async () => {
  const user = { id: 'u-1', emailVerified: true, name: 'Avant' };
  const sessions = new Map([
    ['valid-token', { userId: user.id, expiresAt: 2_000 }],
  ]);
  const users = new Map([[user.id, user]]);
  let persisted;
  let resolvePersistence;
  const persistence = new Promise((resolve) => {
    resolvePersistence = resolve;
  });
  const harness = createHarness({
    sessions,
    users,
    async persistUser(after, before) {
      persisted = { after: { ...after }, before };
      resolvePersistence();
    },
  });
  const res = createResponse();

  await harness.sessionAuth.auth(request('valid-token'), res, () => {
    user.name = 'Apres';
    res.json({ ok: true });
  });
  await persistence;

  assert.equal(persisted.before.name, 'Avant');
  assert.equal(persisted.after.name, 'Apres');
  assert.deepEqual(res.body, { ok: true });
});

test('session auth refuse un compte suspendu avec la reponse HTTP existante', async () => {
  const user = {
    id: 'u-1',
    emailVerified: true,
    suspendedUntil: 2_000,
  };
  const sessions = new Map([
    ['valid-token', { userId: user.id, expiresAt: 2_000 }],
  ]);
  const users = new Map([[user.id, user]]);
  const harness = createHarness({ sessions, users });
  const res = createResponse();

  await harness.sessionAuth.auth(request('valid-token'), res, () => {
    assert.fail('next ne doit pas etre appele');
  });

  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, {
    code: 'account_suspended',
    error: 'Votre compte est temporairement suspendu. Vous pouvez contester cette decision depuis votre profil.',
  });
});

test('session auth invalide la session d un compte email non verifie', async () => {
  const user = {
    id: 'u-1',
    email: 'member@example.com',
    emailVerified: false,
    provider: 'email',
  };
  const sessions = new Map([
    ['pending-token', { userId: user.id, expiresAt: 2_000 }],
  ]);
  const users = new Map([[user.id, user]]);
  const harness = createHarness({ sessions, users });
  const res = createResponse();

  await harness.sessionAuth.auth(request('pending-token'), res, () => {
    assert.fail('next ne doit pas etre appele');
  });

  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, {
    needsVerification: true,
    pendingEmail: user.email,
    error: 'Verifiez votre adresse email avant d acceder a l application.',
  });
  assert.deepEqual(harness.deletedTokens, ['pending-token']);
  assert.equal(harness.saveCalls, 1);
});

test('session auth transforme une panne de session HTTP en 503', async () => {
  const harness = createHarness({
    getPersistentSession: async () => {
      throw new Error('database offline');
    },
  });
  const res = createResponse();

  await harness.sessionAuth.auth(request('valid-token'), res, () => {
    assert.fail('next ne doit pas etre appele');
  });

  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.body, {
    error: 'Service de session temporairement indisponible.',
  });
  assert.deepEqual(harness.logs, ['Echec de verification de session']);
});

test('session auth realtime accepte le token de query et conserve sa reponse suspendue', async () => {
  const user = {
    id: 'u-1',
    emailVerified: true,
    suspendedUntil: 2_000,
  };
  const sessions = new Map([
    ['query-token', { userId: user.id, expiresAt: 2_000 }],
  ]);
  const users = new Map([[user.id, user]]);
  const harness = createHarness({ sessions, users });
  const res = createResponse();

  await harness.sessionAuth.authRealtime(request(null, { token: 'query-token' }), res, () => {
    assert.fail('next ne doit pas etre appele');
  });

  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, {
    code: 'account_suspended',
    error: 'Compte temporairement suspendu.',
  });
});
