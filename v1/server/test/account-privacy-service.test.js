import assert from 'node:assert/strict';
import test from 'node:test';
import { createAccountPrivacyService } from '../services/account-privacy.js';

function createHarness(overrides = {}) {
  const events = [];
  const confirmations = new Map();
  const db = {
    listings: [],
    trips: [],
    transactions: [],
    disputes: [],
  };
  const dependencies = {
    db,
    confirmations: {
      get(userId) {
        events.push('confirmation:get');
        return confirmations.get(userId) || null;
      },
      set(userId, value) {
        events.push('confirmation:set');
        confirmations.set(userId, value);
      },
      remove(userId) {
        events.push('confirmation:remove');
        confirmations.delete(userId);
      },
    },
    messages: {
      async listFromUser() {
        return [];
      },
    },
    kyc: {
      listForUser() {
        return [];
      },
      purgeSensitiveForUser() {
        events.push('kyc:purge');
      },
    },
    rateLimit() {
      return false;
    },
    newCode() {
      return '123456';
    },
    async deliverCode() {
      events.push('deliver');
    },
    demoHint(code, lang) {
      return `${lang}:${code}`;
    },
    isClosedStatus(status) {
      return ['released', 'refunded', 'cancelled'].includes(status);
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
    service: createAccountPrivacyService(dependencies),
    db,
    events,
    confirmations,
  };
}

function member() {
  return {
    id: 'u-1',
    name: 'Membre',
    email: 'membre@example.test',
    phone: '+32000000000',
    city: 'Bruxelles',
    photoUrl: 'data:image/png;base64,AAAA',
    passwordHash: 'secret-hash',
    provider: 'email',
  };
}

test('account privacy service envoie puis conserve une demande de suppression', async () => {
  const user = member();
  const { service, events, confirmations } = createHarness({
    async deliverCode(email, code, purpose, lang) {
      events.push('deliver');
      assert.deepEqual({ email, code, purpose, lang }, {
        email: user.email,
        code: '123456',
        purpose: 'delete_account',
        lang: 'fr',
      });
    },
  });
  const result = await service.requestDeletion({ user, lang: 'fr' });

  assert.deepEqual(events, ['deliver', 'confirmation:set', 'save']);
  assert.deepEqual(confirmations.get(user.id), {
    type: 'delete_account',
    code: '123456',
    expires: 910_000,
  });
  assert.deepEqual(result, {
    value: { ok: true, demoHint: 'fr:123456' },
  });
});

test('account privacy service ne persiste pas une demande limitee ou non envoyee', async () => {
  const limited = createHarness({
    rateLimit(key) {
      assert.equal(key, 'delete-account:u-1');
      return true;
    },
  });
  assert.deepEqual(await limited.service.requestDeletion({
    user: member(),
    lang: 'fr',
  }), {
    status: 429,
    error: 'Trop de demandes. Reessayez plus tard.',
  });
  assert.deepEqual(limited.events, []);

  const unavailable = createHarness({
    async deliverCode() {
      unavailable.events.push('deliver');
      throw new Error('Email indisponible');
    },
  });
  assert.deepEqual(await unavailable.service.requestDeletion({
    user: member(),
    lang: 'fr',
  }), {
    status: 503,
    error: 'Email indisponible',
  });
  assert.deepEqual(unavailable.events, ['deliver']);
  assert.equal(unavailable.confirmations.size, 0);
});

test('account privacy service exporte uniquement les donnees du membre sans hash', async () => {
  const user = member();
  const { service, db } = createHarness({
    messages: {
      async listFromUser(userId) {
        assert.equal(userId, user.id);
        return [{ id: 'm-1', from: userId }];
      },
    },
    kyc: {
      listForUser(userId) {
        assert.equal(userId, user.id);
        return [{
          id: 'kyc-1',
          submittedAt: 1,
          status: 'verified',
          legalName: 'Nom légal',
          birthDate: '1990-01-01',
          documentType: 'passport',
          reviewedAt: 2,
          decisionReason: null,
          selfiePhoto: 'secret-photo',
        }];
      },
      purgeSensitiveForUser() {},
    },
  });
  db.listings.push(
    { id: 'l-1', senderId: user.id },
    { id: 'l-2', senderId: 'u-2' },
  );
  db.trips.push(
    { id: 't-1', travelerId: user.id },
    { id: 't-2', travelerId: 'u-2' },
  );
  db.transactions.push(
    { id: 'tx-1', senderId: user.id, travelerId: 'u-2' },
    { id: 'tx-2', senderId: 'u-2', travelerId: 'u-3' },
  );
  db.disputes.push(
    { id: 'd-1', openedBy: user.id },
    { id: 'd-2', openedBy: 'u-2' },
  );

  const exported = await service.exportData(user);

  assert.equal(exported.exportedAt, '1970-01-01T00:00:10.000Z');
  assert.equal('passwordHash' in exported.user, false);
  assert.deepEqual(exported.listings.map((item) => item.id), ['l-1']);
  assert.deepEqual(exported.trips.map((item) => item.id), ['t-1']);
  assert.deepEqual(exported.transactions.map((item) => item.id), ['tx-1']);
  assert.deepEqual(exported.disputes.map((item) => item.id), ['d-1']);
  assert.deepEqual(exported.messages, [{ id: 'm-1', from: user.id }]);
  assert.deepEqual(exported.kyc, [{
    id: 'kyc-1',
    submittedAt: 1,
    status: 'verified',
    legalName: 'Nom légal',
    birthDate: '1990-01-01',
    documentType: 'passport',
    reviewedAt: 2,
    decisionReason: null,
  }]);
  assert.equal(JSON.stringify(exported).includes('secret-photo'), false);
});

test('account privacy service refuse un code invalide ou une operation active', async () => {
  const user = member();
  const invalid = createHarness();
  assert.deepEqual(await invalid.service.deleteAccount({
    user,
    body: { code: '123456' },
  }), {
    status: 400,
    error: 'Code de confirmation expire. Demandez-en un nouveau.',
  });

  const active = createHarness();
  active.confirmations.set(user.id, {
    type: 'delete_account',
    code: '123456',
    expires: 20_000,
  });
  active.db.transactions.push({
    id: 'tx-1',
    senderId: user.id,
    status: 'accepted',
  });
  assert.deepEqual(await active.service.deleteAccount({
    user,
    body: { code: '123456' },
  }), {
    status: 400,
    error: 'Impossible : 1 transaction(s) encore en cours. Terminez-les d\'abord.',
  });
  assert.equal(user.email, 'membre@example.test');
  assert.deepEqual(active.events, ['confirmation:get']);
});

test('account privacy utilise les dossiers relationnels pour export et suppression', async () => {
  const user = member();
  const relational = {
    listings: [{ id: 'l-sql' }],
    trips: [{ id: 't-sql' }],
    transactions: [{ id: 'tx-sql' }],
    disputes: [{ id: 'd-sql' }],
  };
  const { service, confirmations } = createHarness({
    async loadRelationalRecords(userId) {
      assert.equal(userId, user.id);
      return relational;
    },
    async countRelationalActiveOperations(userId) {
      assert.equal(userId, user.id);
      return 2;
    },
  });

  const exported = await service.exportData(user);
  assert.deepEqual(exported.trips, relational.trips);
  assert.deepEqual(exported.transactions, relational.transactions);

  confirmations.set(user.id, {
    type: 'delete_account',
    code: '123456',
    expires: 20_000,
  });
  const blocked = await service.deleteAccount({
    user,
    body: { code: '123456' },
  });
  assert.equal(blocked.status, 400);
  assert.match(blocked.error, /2 transaction/);
});

test('account privacy service anonymise, purge, invalide, audite puis sauvegarde', async () => {
  const user = member();
  let auditPayload;
  const { service, db, events, confirmations } = createHarness({
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
    type: 'delete_account',
    code: '123456',
    expires: 20_000,
  });
  db.transactions.push({
    id: 'tx-closed',
    recipientId: user.id,
    status: 'released',
  });
  const before = { ...user };

  const result = await service.deleteAccount({
    user,
    body: { code: ' 123456 ' },
  });

  assert.deepEqual(events, [
    'confirmation:get',
    'confirmation:remove',
    'kyc:purge',
    'sessions',
    'audit',
    'save',
  ]);
  assert.deepEqual(user, {
    ...before,
    name: 'Compte supprimé',
    email: `deleted-${user.id}@wigofly.invalid`,
    phone: '',
    city: '',
    photoUrl: null,
    passwordHash: null,
    provider: 'deleted',
    deletedAt: 10_000,
  });
  assert.deepEqual(auditPayload, {
    actorId: user.id,
    action: 'profile.delete',
    targetType: 'user',
    targetId: user.id,
    subjectUserId: user.id,
    before,
    after: user,
    fields: ['name', 'email', 'phone', 'city', 'provider'],
    meta: { recordEmpty: true },
  });
  assert.deepEqual(result, { value: { ok: true } });
});
