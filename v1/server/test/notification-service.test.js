import assert from 'node:assert/strict';
import test from 'node:test';
import { createNotificationService } from '../services/notifications.js';

const DEFAULT_SETTINGS = {
  transactions: true,
  shipments: true,
  reminders: true,
  security: true,
};

function createHarness(users = []) {
  const appended = [];
  const renderCalls = [];
  const userMap = new Map(users.map((user) => [user.id, user]));
  const notify = createNotificationService({
    notifications: {
      async append(entry) {
        appended.push(entry);
        return { id: `n-${appended.length}`, ...entry };
      },
    },
    findUser: (id) => userMap.get(id),
    getUserSettings: (user) => user.settings,
    defaultSettings: DEFAULT_SETTINGS,
    renderNotification(lang, notification) {
      renderCalls.push([lang, notification]);
      return `${lang}:${notification.key}`;
    },
  });

  return { appended, notify, renderCalls };
}

test('notification service dedoublonne les destinataires et persiste une cle i18n', async () => {
  const user = {
    id: 'u-1',
    settings: { notifications: { ...DEFAULT_SETTINGS } },
  };
  const harness = createHarness([user]);
  const keyed = { key: 'offer.expiring', params: { title: 'Diplome' } };

  const result = await harness.notify(
    ['u-1', null, 'u-1'],
    keyed,
    'tx-1',
    'reminders',
    'matching',
  );

  assert.equal(result.length, 1);
  assert.deepEqual(harness.appended, [{
    userId: 'u-1',
    txId: 'tx-1',
    type: 'reminders',
    section: 'matching',
    key: keyed.key,
    params: keyed.params,
    text: 'fr:offer.expiring',
  }]);
  assert.deepEqual(harness.renderCalls, [['fr', keyed]]);
});

test('notification service respecte une preference desactivee', async () => {
  const user = {
    id: 'u-1',
    settings: {
      notifications: {
        ...DEFAULT_SETTINGS,
        transactions: false,
      },
    },
  };
  const harness = createHarness([user]);

  assert.deepEqual(
    await harness.notify(['u-1'], { key: 'offer.received' }, null, 'transactions'),
    [],
  );
  assert.deepEqual(harness.appended, []);
  assert.deepEqual(harness.renderCalls, []);
});

test('notification service ne permet pas de desactiver une alerte de securite', async () => {
  const user = {
    id: 'u-1',
    settings: {
      notifications: {
        ...DEFAULT_SETTINGS,
        security: false,
      },
    },
  };
  const harness = createHarness([user]);

  await harness.notify(['u-1'], { key: 'security.alert' }, null, 'security');

  assert.equal(harness.appended.length, 1);
  assert.equal(harness.appended[0].type, 'security');
});

test('notification service replie un type inconnu sur transactions', async () => {
  const harness = createHarness();

  await harness.notify(['missing-user'], 'Texte historique', 'tx-2', 'unknown');

  assert.deepEqual(harness.appended, [{
    userId: 'missing-user',
    txId: 'tx-2',
    type: 'transactions',
    section: null,
    text: 'Texte historique',
  }]);
  assert.deepEqual(harness.renderCalls, []);
});

test('notification service complete les params absents sans modifier la cle source', async () => {
  const user = {
    id: 'u-1',
    settings: { notifications: { ...DEFAULT_SETTINGS } },
  };
  const harness = createHarness([user]);
  const keyed = { key: 'shipment.ready' };

  await harness.notify(['u-1'], keyed);

  assert.deepEqual(keyed, { key: 'shipment.ready' });
  assert.deepEqual(harness.appended[0].params, {});
  assert.equal(harness.appended[0].type, 'transactions');
});
