import assert from 'node:assert/strict';
import express from 'express';
import test from 'node:test';
import { createAuthRegistrationRouter } from '../routes/auth-registration.js';

function createDependencies(overrides = {}) {
  const events = [];
  const usersByEmail = new Map();
  const pending = new Map();
  const dependencies = {
    users: {
      findByEmail(email) {
        return usersByEmail.get(String(email || '').trim().toLowerCase()) || null;
      },
      append(user) {
        events.push('user:append');
        usersByEmail.set(user.email, user);
      },
    },
    verifications: {
      get(email) {
        events.push('verification:get');
        return pending.get(email) || null;
      },
      set(email, value) {
        events.push('verification:set');
        pending.set(email, value);
      },
      remove(email) {
        events.push('verification:remove');
        pending.delete(email);
      },
    },
    validRegistration() {
      return null;
    },
    makeUser(input) {
      events.push('user:make');
      return {
        ...input,
        id: 'u-1',
        email: String(input.email).trim().toLowerCase(),
        emailVerified: false,
      };
    },
    hashPassword(password) {
      events.push('password:hash');
      return `hash:${password}`;
    },
    clientIp() {
      return '127.0.0.1';
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
    normalizeEmail(value) {
      return String(value || '').trim().toLowerCase();
    },
    rateLimit() {
      return false;
    },
    async openSession(_res, _user, _req, options) {
      events.push('session');
      return { options };
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
    usersByEmail,
    pending,
  };
}

async function requestRegistration({
  method = 'POST',
  path,
  body = {},
  dependencies,
}) {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', createAuthRegistrationRouter(dependencies));
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });

  try {
    const address = server.address();
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/auth${path}`,
      {
        method,
        headers: { 'Content-Type': 'application/json' },
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

test('auth registration route envoie avant de creer et sauvegarder le compte', async () => {
  const { dependencies, events, usersByEmail, pending } = createDependencies({
    async deliverCode(email, code, purpose, lang) {
      events.push('deliver');
      assert.deepEqual({ email, code, purpose, lang }, {
        email: 'membre@example.test',
        code: '123456',
        purpose: 'verify',
        lang: undefined,
      });
    },
  });
  const response = await requestRegistration({
    path: '/register',
    dependencies,
    body: {
      name: 'Membre',
      email: '  membre@example.test ',
      phone: '+32000000000',
      password: 'secret-valide',
      cguAccepted: true,
      rememberMe: true,
    },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(events, [
    'password:hash',
    'user:make',
    'deliver',
    'user:append',
    'verification:set',
    'save',
  ]);
  assert.equal(usersByEmail.get('membre@example.test').passwordHash, 'hash:secret-valide');
  assert.deepEqual(pending.get('membre@example.test'), {
    code: '123456',
    expires: 910_000,
    rememberMe: true,
  });
  assert.deepEqual(response.body, {
    pendingEmail: 'membre@example.test',
    message: 'Un code de verification vient d etre envoye.',
    demoHint: 'undefined:123456',
  });
});

test('auth registration route ne cree rien si validation, CGU ou email echoue', async () => {
  const invalid = createDependencies({
    validRegistration() {
      return 'Nom trop court';
    },
  });
  assert.equal((await requestRegistration({
    path: '/register',
    dependencies: invalid.dependencies,
    body: {},
  })).status, 400);
  assert.deepEqual(invalid.events, []);

  const cgu = createDependencies();
  assert.deepEqual((await requestRegistration({
    path: '/register',
    dependencies: cgu.dependencies,
    body: {
      name: 'Membre',
      email: 'membre@example.test',
      password: 'secret-valide',
      cguAccepted: false,
    },
  })).body, {
    error: 'Vous devez accepter les Conditions Générales d\'Utilisation',
  });
  assert.deepEqual(cgu.events, []);

  const unavailable = createDependencies({
    async deliverCode() {
      unavailable.events.push('deliver');
      throw new Error('Email indisponible');
    },
  });
  const failed = await requestRegistration({
    path: '/register',
    dependencies: unavailable.dependencies,
    body: {
      name: 'Membre',
      email: 'membre@example.test',
      password: 'secret-valide',
      cguAccepted: true,
    },
  });
  assert.equal(failed.status, 503);
  assert.deepEqual(unavailable.events, ['password:hash', 'user:make', 'deliver']);
  assert.equal(unavailable.usersByEmail.size, 0);
  assert.equal(unavailable.pending.size, 0);
});

test('auth verification route retire le code puis ouvre la session avec rememberMe', async () => {
  const user = { id: 'u-1', email: 'membre@example.test', emailVerified: false };
  let sessionOptions;
  const { dependencies, events, usersByEmail, pending } = createDependencies({
    async openSession(res, candidate, _req, options) {
      events.push('session');
      assert.equal(candidate, user);
      sessionOptions = options;
      res.json({ token: 'token-session' });
    },
  });
  usersByEmail.set(user.email, user);
  pending.set(user.email, {
    code: '123456',
    expires: 20_000,
    rememberMe: true,
  });
  const response = await requestRegistration({
    path: '/verify-email',
    dependencies,
    body: { email: ' MEMBRE@example.test ', code: ' 123456 ' },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { token: 'token-session' });
  assert.equal(user.emailVerified, true);
  assert.equal(pending.has(user.email), false);
  assert.deepEqual(events, [
    'verification:get',
    'verification:remove',
    'session',
  ]);
  assert.deepEqual(sessionOptions, { rememberMe: true });
});

test('auth verification route refuse limite, expiration et mauvais code', async () => {
  const limited = createDependencies({
    rateLimit(key) {
      assert.equal(key, 'verify:membre@example.test');
      return true;
    },
  });
  assert.equal((await requestRegistration({
    path: '/verify-email',
    dependencies: limited.dependencies,
    body: { email: 'membre@example.test', code: '123456' },
  })).status, 429);
  assert.deepEqual(limited.events, []);

  const expired = createDependencies();
  expired.pending.set('membre@example.test', {
    code: '123456',
    expires: 9_999,
  });
  assert.equal((await requestRegistration({
    path: '/verify-email',
    dependencies: expired.dependencies,
    body: { email: 'membre@example.test', code: '123456' },
  })).status, 400);

  const incorrect = createDependencies();
  incorrect.pending.set('membre@example.test', {
    code: '123456',
    expires: 20_000,
  });
  const response = await requestRegistration({
    path: '/verify-email',
    dependencies: incorrect.dependencies,
    body: { email: 'membre@example.test', code: '000000' },
  });
  assert.deepEqual(response.body, { error: 'Code incorrect' });
  assert.equal(incorrect.pending.has('membre@example.test'), true);
});

test('auth resend route garde rememberMe et ne remplace rien si envoi echoue', async () => {
  const user = { id: 'u-1', email: 'membre@example.test' };
  const success = createDependencies();
  success.usersByEmail.set(user.email, user);
  success.pending.set(user.email, {
    code: 'ancien',
    expires: 12_000,
    rememberMe: true,
  });
  const response = await requestRegistration({
    path: '/resend-code',
    dependencies: success.dependencies,
    body: { email: user.email },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(success.pending.get(user.email), {
    code: '123456',
    expires: 910_000,
    rememberMe: true,
  });
  assert.deepEqual(success.events, [
    'verification:get',
    'deliver',
    'verification:set',
    'save',
  ]);

  const failed = createDependencies({
    async deliverCode() {
      failed.events.push('deliver');
      throw new Error('Email indisponible');
    },
  });
  failed.usersByEmail.set(user.email, user);
  const previous = {
    code: 'ancien',
    expires: 20_000,
    rememberMe: false,
  };
  failed.pending.set(user.email, previous);
  assert.equal((await requestRegistration({
    path: '/resend-code',
    dependencies: failed.dependencies,
    body: { email: user.email },
  })).status, 503);
  assert.equal(failed.pending.get(user.email), previous);
});

test('auth google route reste explicitement indisponible', async () => {
  const { dependencies } = createDependencies();
  const response = await requestRegistration({
    path: '/google',
    dependencies,
  });
  assert.equal(response.status, 410);
  assert.deepEqual(response.body, { error: 'Connexion Google indisponible' });
});
