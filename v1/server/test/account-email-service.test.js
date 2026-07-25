import assert from 'node:assert/strict';
import test from 'node:test';
import { createAccountEmailService } from '../services/account-email.js';

function createHarness(overrides = {}) {
  const events = [];
  const records = new Map();
  const confirmations = {
    get(userId) {
      events.push('get');
      return records.get(userId) || null;
    },
    set(userId, value) {
      events.push('set');
      records.set(userId, value);
    },
    remove(userId) {
      events.push('remove');
      records.delete(userId);
    },
  };
  const dependencies = {
    confirmations,
    normalizeEmail(value) {
      return String(value || '').trim().toLowerCase();
    },
    emailPattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    findByEmail() {
      return null;
    },
    verifyPassword(password, hash) {
      return password === 'secret-actuel' && hash === 'hash-actuel';
    },
    rateLimit() {
      return false;
    },
    newCode() {
      return '123456';
    },
    async deliverCode(email, code, purpose, lang) {
      events.push('deliver');
      assert.deepEqual(
        { email, code, purpose, lang },
        {
          email: 'nouveau@example.test',
          code: '123456',
          purpose: 'change_email',
          lang: 'nl',
        },
      );
    },
    demoHint(code, lang) {
      return `${lang}:${code}`;
    },
    async clearUserSessions() {
      events.push('sessions');
    },
    async auditChange() {
      events.push('audit');
    },
    save() {
      events.push('save');
    },
    now() {
      return 10_000;
    },
    confirmationTtlMs: 900_000,
    ...overrides,
  };

  return {
    service: createAccountEmailService(dependencies),
    confirmations,
    events,
    records,
  };
}

function member() {
  return {
    id: 'u-1',
    email: 'ancien@example.test',
    emailVerified: true,
    passwordHash: 'hash-actuel',
  };
}

test('account email service envoie puis persiste une demande normalisee', async () => {
  const { service, events, records } = createHarness();
  const result = await service.requestChange({
    user: member(),
    body: {
      newEmail: '  NOUVEAU@example.test ',
      currentPassword: 'secret-actuel',
    },
    lang: 'nl',
  });

  assert.deepEqual(events, ['deliver', 'set', 'save']);
  assert.deepEqual(records.get('u-1'), {
    type: 'change_email',
    newEmail: 'nouveau@example.test',
    code: '123456',
    expires: 910_000,
  });
  assert.deepEqual(result, {
    value: { ok: true, demoHint: 'nl:123456' },
  });
});

test('account email service conserve l ordre des refus avant envoi', async () => {
  const user = member();
  const invalid = createHarness();
  assert.deepEqual(await invalid.service.requestChange({
    user,
    body: { newEmail: 'invalide', currentPassword: 'secret-actuel' },
    lang: 'fr',
  }), { status: 400, error: 'Adresse email invalide' });
  assert.deepEqual(invalid.events, []);

  const same = createHarness();
  assert.deepEqual(await same.service.requestChange({
    user,
    body: { newEmail: user.email, currentPassword: 'secret-actuel' },
    lang: 'fr',
  }), {
    status: 400,
    error: 'Utilisez une adresse email differente',
  });
  assert.deepEqual(same.events, []);

  const existing = createHarness({
    findByEmail() {
      return { id: 'u-2' };
    },
  });
  assert.deepEqual(await existing.service.requestChange({
    user,
    body: {
      newEmail: 'nouveau@example.test',
      currentPassword: 'secret-actuel',
    },
    lang: 'fr',
  }), {
    status: 400,
    error: 'Un compte utilise deja cette adresse email',
  });

  const wrongPassword = createHarness();
  assert.deepEqual(await wrongPassword.service.requestChange({
    user,
    body: {
      newEmail: 'nouveau@example.test',
      currentPassword: 'incorrect',
    },
    lang: 'fr',
  }), {
    status: 400,
    error: 'Mot de passe actuel incorrect',
  });

  const limited = createHarness({
    rateLimit(key) {
      assert.equal(key, `change-email:${user.id}`);
      return true;
    },
  });
  assert.deepEqual(await limited.service.requestChange({
    user,
    body: {
      newEmail: 'nouveau@example.test',
      currentPassword: 'secret-actuel',
    },
    lang: 'fr',
  }), {
    status: 429,
    error: 'Trop de demandes. Reessayez plus tard.',
  });
  assert.deepEqual(limited.events, []);
});

test('account email service ne stocke rien si l envoi du code echoue', async () => {
  const { service, events, records } = createHarness({
    async deliverCode() {
      events.push('deliver');
      throw new Error('Email indisponible');
    },
  });
  const result = await service.requestChange({
    user: member(),
    body: {
      newEmail: 'nouveau@example.test',
      currentPassword: 'secret-actuel',
    },
    lang: 'fr',
  });

  assert.deepEqual(result, { status: 503, error: 'Email indisponible' });
  assert.deepEqual(events, ['deliver']);
  assert.equal(records.size, 0);
});

test('account email service confirme, invalide les sessions, audite puis sauvegarde', async () => {
  const user = member();
  let auditPayload;
  const { service, confirmations, events } = createHarness({
    async clearUserSessions(userId) {
      events.push('sessions');
      assert.equal(userId, user.id);
    },
    async auditChange(payload) {
      events.push('audit');
      auditPayload = payload;
    },
  });
  confirmations.set(user.id, {
    type: 'change_email',
    newEmail: 'nouveau@example.test',
    code: '123456',
    expires: 20_000,
  });
  events.length = 0;

  const result = await service.confirmChange({
    user,
    body: { code: ' 123456 ' },
  });

  assert.deepEqual(events, ['get', 'remove', 'sessions', 'audit', 'save']);
  assert.equal(user.email, 'nouveau@example.test');
  assert.equal(user.emailVerified, true);
  assert.deepEqual(auditPayload, {
    actorId: user.id,
    action: 'profile.email.update',
    targetType: 'user',
    targetId: user.id,
    subjectUserId: user.id,
    before: { email: 'ancien@example.test' },
    after: user,
    fields: ['email'],
  });
  assert.deepEqual(result, {
    value: { ok: true, mustRelogin: true },
  });
});

test('account email service refuse code expire, incorrect ou email devenu occupe', async () => {
  const user = member();

  const expired = createHarness();
  expired.records.set(user.id, {
    type: 'change_email',
    newEmail: 'nouveau@example.test',
    code: '123456',
    expires: 9_999,
  });
  assert.deepEqual(await expired.service.confirmChange({
    user,
    body: { code: '123456' },
  }), {
    status: 400,
    error: 'Code expire. Recommencez la demande.',
  });

  const incorrect = createHarness();
  incorrect.records.set(user.id, {
    type: 'change_email',
    newEmail: 'nouveau@example.test',
    code: '123456',
    expires: 20_000,
  });
  assert.deepEqual(await incorrect.service.confirmChange({
    user,
    body: { code: '000000' },
  }), { status: 400, error: 'Code incorrect' });

  const occupied = createHarness({
    findByEmail() {
      return { id: 'u-2' };
    },
  });
  occupied.records.set(user.id, {
    type: 'change_email',
    newEmail: 'nouveau@example.test',
    code: '123456',
    expires: 20_000,
  });
  assert.deepEqual(await occupied.service.confirmChange({
    user,
    body: { code: '123456' },
  }), {
    status: 400,
    error: 'Cette adresse email est deja utilisee',
  });
  assert.equal(user.email, 'ancien@example.test');
});
