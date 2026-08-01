import assert from 'node:assert/strict';
import express from 'express';
import test from 'node:test';
import { createAuthAccessRouter } from '../routes/auth-access.js';

function createDependencies(overrides = {}) {
  const events = [];
  const users = new Map();
  const verifications = new Map();
  const resets = new Map();
  const dependencies = {
    auth(req, _res, next) {
      req.user = { id: 'u-1' };
      next();
    },
    users: {
      findByEmail(email) {
        return users.get(email) || null;
      },
    },
    verifications: {
      set(email, value) {
        events.push('verification:set');
        verifications.set(email, value);
      },
    },
    resets: {
      get(email) {
        events.push('reset:get');
        return resets.get(email) || null;
      },
      set(email, value) {
        events.push('reset:set');
        resets.set(email, value);
      },
      remove(email) {
        events.push('reset:remove');
        resets.delete(email);
      },
    },
    normalizeEmail(value) {
      return String(value || '').trim().toLowerCase();
    },
    rateLimit() {
      return false;
    },
    verifyPassword(password, hash) {
      return password === 'secret-valide' && hash === 'hash-actuel';
    },
    newToken() {
      return 'token-suspendu';
    },
    async createSession() {
      events.push('session:create');
    },
    sessionDurationMs: 86_400_000,
    canAccessApp(user) {
      return user.emailVerified === true;
    },
    newCode() {
      return '123456';
    },
    async deliverCode() {
      events.push('deliver');
    },
    save() {
      events.push('save');
    },
    demoHint(code, lang) {
      return `${lang}:${code}`;
    },
    hashPassword(password) {
      events.push('password:hash');
      return `hash:${password}`;
    },
    async clearUserSessions() {
      events.push('sessions:clear');
    },
    async openSession(res, _user, _req, options = {}) {
      events.push('session:open');
      res.json({ token: 'token-normal', rememberMe: !!options.rememberMe });
    },
    async deleteSession() {
      events.push('session:delete');
    },
    now() {
      return 10_000;
    },
    codeTtlMs: 900_000,
    ...overrides,
  };
  return {
    dependencies,
    events,
    users,
    verifications,
    resets,
  };
}

async function requestAccess({
  path,
  body = {},
  token,
  dependencies,
}) {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', createAuthAccessRouter(dependencies));
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });

  try {
    const address = server.address();
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/auth${path}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
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

test('auth login refuse limitation et identifiants sans ouvrir de session', async () => {
  const limited = createDependencies({
    rateLimit(key) {
      assert.equal(key, 'login:membre@example.test');
      return true;
    },
  });
  assert.equal((await requestAccess({
    path: '/login',
    body: { email: ' MEMBRE@example.test ', password: 'secret-valide' },
    dependencies: limited.dependencies,
  })).status, 429);
  assert.deepEqual(limited.events, []);

  const invalid = createDependencies();
  const response = await requestAccess({
    path: '/login',
    body: { email: 'membre@example.test', password: 'incorrect' },
    dependencies: invalid.dependencies,
  });
  assert.equal(response.status, 401);
  assert.deepEqual(response.body, {
    error: 'Email ou mot de passe incorrect',
  });
  assert.deepEqual(invalid.events, []);
});

test('auth login cree uniquement la session de recours pour un compte suspendu', async () => {
  const user = {
    id: 'u-1',
    email: 'membre@example.test',
    passwordHash: 'hash-actuel',
    emailVerified: true,
    suspendedUntil: 20_000,
    suspensionReason: 'Controle',
  };
  let sessionPayload;
  const { dependencies, events, users } = createDependencies({
    async createSession(payload) {
      events.push('session:create');
      sessionPayload = payload;
    },
  });
  users.set(user.email, user);
  const response = await requestAccess({
    path: '/login',
    body: { email: user.email, password: 'secret-valide' },
    dependencies,
  });

  assert.equal(response.status, 403);
  assert.deepEqual(events, ['session:create']);
  assert.deepEqual(sessionPayload, {
    token: 'token-suspendu',
    userId: user.id,
    expiresAt: 86_410_000,
  });
  assert.deepEqual(response.body, {
    code: 'account_suspended',
    token: 'token-suspendu',
    suspended: true,
    suspendedUntil: 20_000,
    reason: 'Controle',
    error: 'Votre compte est temporairement suspendu. Vous pouvez envoyer un recours.',
  });
});

test('auth login renvoie un code au compte non verifie et ouvre sinon la session demandee', async () => {
  const unverified = {
    id: 'u-1',
    email: 'membre@example.test',
    passwordHash: 'hash-actuel',
    emailVerified: false,
  };
  const pending = createDependencies();
  pending.users.set(unverified.email, unverified);
  const response = await requestAccess({
    path: '/login',
    body: {
      email: unverified.email,
      password: 'secret-valide',
      rememberMe: true,
    },
    dependencies: pending.dependencies,
  });

  assert.equal(response.status, 200);
  assert.deepEqual(pending.events, ['deliver', 'verification:set', 'save']);
  assert.deepEqual(pending.verifications.get(unverified.email), {
    code: '123456',
    expires: 910_000,
    rememberMe: true,
  });
  assert.equal(response.body.needsVerification, true);

  const verified = { ...unverified, emailVerified: true };
  const normal = createDependencies();
  normal.users.set(verified.email, verified);
  const opened = await requestAccess({
    path: '/login',
    body: {
      email: verified.email,
      password: 'secret-valide',
      rememberMe: true,
    },
    dependencies: normal.dependencies,
  });
  assert.deepEqual(opened.body, {
    token: 'token-normal',
    rememberMe: true,
  });
  assert.deepEqual(normal.events, ['session:open']);
});

test('auth forgot garde la meme forme pour un email inconnu', async () => {
  const unknown = createDependencies();
  const response = await requestAccess({
    path: '/forgot',
    body: { email: 'inconnu@example.test' },
    dependencies: unknown.dependencies,
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    ok: true,
    demoHint: 'undefined:—',
  });
  assert.deepEqual(unknown.events, []);
  assert.equal(unknown.resets.size, 0);
});

test('auth forgot envoie avant de stocker le code d un compte existant', async () => {
  const user = { id: 'u-1', email: 'membre@example.test' };
  const { dependencies, events, users, resets } = createDependencies({
    async deliverCode(email, code, purpose, lang) {
      events.push('deliver');
      assert.deepEqual({ email, code, purpose, lang }, {
        email: user.email,
        code: '123456',
        purpose: 'reset',
        lang: undefined,
      });
    },
  });
  users.set(user.email, user);
  const response = await requestAccess({
    path: '/forgot',
    body: { email: user.email },
    dependencies,
  });

  assert.equal(response.status, 200);
  assert.deepEqual(events, ['deliver', 'reset:set', 'save']);
  assert.deepEqual(resets.get(user.email), {
    code: '123456',
    expires: 910_000,
  });
});

test('auth reset consomme le code, invalide les sessions puis reconnecte', async () => {
  const user = {
    id: 'u-1',
    email: 'membre@example.test',
    passwordHash: 'hash-actuel',
    emailVerified: true,
  };
  const { dependencies, events, users, resets } = createDependencies();
  users.set(user.email, user);
  resets.set(user.email, { code: '123456', expires: 20_000 });
  const response = await requestAccess({
    path: '/reset',
    body: {
      email: user.email,
      code: ' 123456 ',
      password: 'nouveau-secret',
      rememberMe: true,
    },
    dependencies,
  });

  assert.equal(response.status, 200);
  assert.equal(user.passwordHash, 'hash:nouveau-secret');
  assert.equal(resets.has(user.email), false);
  assert.deepEqual(events, [
    'reset:get',
    'password:hash',
    'reset:remove',
    'sessions:clear',
    'session:open',
  ]);
  assert.deepEqual(response.body, {
    token: 'token-normal',
    rememberMe: true,
  });
});

test('auth reset ne reconnecte pas encore un compte non verifie', async () => {
  const user = {
    id: 'u-1',
    email: 'membre@example.test',
    passwordHash: 'hash-actuel',
    emailVerified: false,
  };
  const { dependencies, events, users, resets } = createDependencies();
  users.set(user.email, user);
  resets.set(user.email, { code: '123456', expires: 20_000 });
  const response = await requestAccess({
    path: '/reset',
    body: {
      email: user.email,
      code: '123456',
      password: 'nouveau-secret',
    },
    dependencies,
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.needsVerification, true);
  assert.deepEqual(events, [
    'reset:get',
    'password:hash',
    'reset:remove',
    'sessions:clear',
    'save',
  ]);
});

test('auth logout supprime le bearer puis sauvegarde', async () => {
  let deletedToken;
  const { dependencies, events } = createDependencies({
    async deleteSession(token) {
      events.push('session:delete');
      deletedToken = token;
    },
  });
  const response = await requestAccess({
    path: '/logout',
    token: 'token-actuel',
    dependencies,
  });

  assert.equal(response.status, 200);
  assert.equal(deletedToken, 'token-actuel');
  assert.deepEqual(events, ['session:delete', 'save']);
  assert.deepEqual(response.body, { ok: true });
});
