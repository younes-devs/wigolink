import assert from 'node:assert/strict';
import test from 'node:test';
import { createTransactionCommunicationService } from '../services/transaction-communications.js';

function fixture(overrides = {}) {
  const db = {
    transactions: [{
      id: 'tx-1',
      listingId: 'listing-1',
      senderId: 'sender',
      travelerId: 'traveler',
      recipientId: 'recipient',
      sealingVideo: { recordedAt: 123 },
    }],
    listings: [{
      id: 'listing-1',
      title: 'Huile',
      description: 'Description',
      valueEur: 40,
      weightKg: 2,
      from: 'Casablanca',
      categoryId: 'argan',
      categoryLabel: 'Argan',
    }],
    conversations: [],
    ...overrides.db,
  };
  const calls = [];
  const service = createTransactionCommunicationService({
    db,
    isParty: (transaction, userId) =>
      [
        transaction.senderId,
        transaction.travelerId,
        transaction.recipientId,
      ].includes(userId),
    messagesRepository: {
      async listForTransaction(id) {
        calls.push(['list', id]);
        return [{ id: 'message-1' }];
      },
      async append(message) {
        calls.push(['append', message]);
        return { id: 'message-2', ...message };
      },
    },
    analyzeSafety: () => ({ blocked: false }),
    registerSafetyAttempt: () => ({ cooldownUntil: null, highCount: 1 }),
    safetyError: ({ cooldownUntil }) => ({
      code: cooldownUntil ? 'cooldown' : 'blocked',
    }),
    async audit(...args) {
      calls.push(['audit', ...args]);
    },
    save() {
      calls.push(['save']);
    },
    async notify(...args) {
      calls.push(['notify', ...args]);
    },
    localizeCustoms: (_customs, lang) => ({
      'MA-EU': { id: `ma-${lang}` },
      'EU-MA': { id: `eu-${lang}` },
    }),
    customs: {},
    combinedWhitelist: () => [{ id: 'argan', label: 'Argan' }],
    blacklist: [],
    localizeCategory: (category, lang) => ({
      ...category,
      label: `${category.label}-${lang}`,
    }),
    publicUser: (user) => user && ({ id: user.id }),
    findUser: (id) => ({ id }),
    ...overrides.dependencies,
  });
  return { service, db, calls };
}

test('lecture des messages protege la transaction et autorise un admin', async () => {
  const { service, calls } = fixture();

  assert.equal(
    (await service.messages('missing', { id: 'sender' })).status,
    404,
  );
  assert.equal(
    (await service.messages('tx-1', { id: 'outsider' })).status,
    403,
  );
  const result = await service.messages(
    'tx-1',
    { id: 'admin', isAdmin: true },
  );

  assert.equal(result.status, 200);
  assert.deepEqual(result.body.messages, [{ id: 'message-1' }]);
  assert.deepEqual(calls, [['list', 'tx-1']]);
});

test('message bloque est audite sans etre persiste comme message', async () => {
  const safety = {
    blocked: true,
    categories: ['phone'],
    severity: 'high',
  };
  const { service, calls } = fixture({
    dependencies: {
      analyzeSafety: () => safety,
      registerSafetyAttempt: () => ({
        cooldownUntil: 456,
        highCount: 3,
      }),
    },
  });

  const result = await service.sendMessage(
    'tx-1',
    { id: 'sender', name: 'Sender' },
    { text: '0612345678' },
  );

  assert.equal(result.status, 429);
  assert.equal(result.body.code, 'cooldown');
  assert.equal(calls.some(([name]) => name === 'append'), false);
  assert.equal(calls.some(([name]) => name === 'notify'), false);
  assert.equal(calls[0][0], 'audit');
  assert.equal(calls.at(-1)[0], 'save');
});

test('message valide est tronque, notifie puis sauvegarde', async () => {
  const { service, calls } = fixture();
  const result = await service.sendMessage(
    'tx-1',
    { id: 'sender', name: 'Sender' },
    { text: 'x'.repeat(2100) },
  );

  assert.equal(result.status, 200);
  assert.equal(result.body.message.text.length, 2000);
  assert.equal(result.body.warning, null);
  assert.deepEqual(
    calls.map(([name]) => name),
    ['append', 'notify', 'save'],
  );
});

test('un utilisateur exterieur et un admin exterieur ne peuvent pas ecrire', async () => {
  const { service, calls } = fixture();

  assert.equal(
    (await service.sendMessage(
      'tx-1',
      { id: 'outsider' },
      { text: 'Bonjour' },
    )).status,
    403,
  );
  assert.equal(
    (await service.sendMessage(
      'tx-1',
      { id: 'admin', isAdmin: true },
      { text: 'Bonjour' },
    )).status,
    403,
  );
  assert.deepEqual(calls, []);
});

test('recap douane localise les donnees et refuse une annonce absente', () => {
  const { service, db } = fixture();
  const result = service.customsRecap(
    'tx-1',
    { id: 'traveler' },
    'nl',
  );

  assert.equal(result.status, 200);
  assert.equal(result.body.recap.category, 'Argan-nl');
  assert.deepEqual(result.body.recap.corridor, { id: 'ma-nl' });
  assert.deepEqual(result.body.recap.sender, { id: 'sender' });

  db.transactions[0].listingId = null;
  const missingListing = service.customsRecap(
    'tx-1',
    { id: 'traveler' },
    'fr',
  );
  assert.equal(missingListing.status, 404);
  assert.equal(missingListing.body.error, 'Annonce introuvable');
});
