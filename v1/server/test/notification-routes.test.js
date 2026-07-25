import assert from 'node:assert/strict';
import express from 'express';
import test from 'node:test';
import { createNotificationsRouter } from '../routes/notifications.js';

async function requestNotifications({
  method = 'GET',
  path = '/',
  auth,
  notifications,
  runMatchingOfferReminders,
  renderNotification,
  save,
}) {
  const app = express();
  app.use('/api/notifications', createNotificationsRouter({
    auth,
    notifications,
    runMatchingOfferReminders,
    renderNotification,
    save,
  }));
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });

  try {
    const address = server.address();
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/notifications${path}`,
      { method },
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

function authenticated(req, _res, next) {
  req.user = { id: 'u-1' };
  req.lang = 'nl';
  next();
}

test('notification routes executent les rappels puis traduisent les 30 dernieres', async () => {
  const events = [];
  const stored = [
    { id: 'n-2', key: 'second', text: 'Texte stocke' },
    { id: 'n-1', key: 'first', text: 'Ancien texte' },
  ];
  const response = await requestNotifications({
    auth: authenticated,
    notifications: {
      async listForUser(userId, options) {
        events.push(['list', userId, options]);
        return stored;
      },
      async unreadCount(userId) {
        events.push(['unread', userId]);
        return 2;
      },
    },
    async runMatchingOfferReminders(options) {
      events.push(['reminders', options]);
    },
    renderNotification(lang, notification) {
      events.push(['render', lang, notification.id]);
      return `${lang}:${notification.id}`;
    },
    save() {
      assert.fail('save ne doit pas etre appele pendant la lecture');
    },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    notifications: [
      { id: 'n-2', key: 'second', text: 'nl:n-2' },
      { id: 'n-1', key: 'first', text: 'nl:n-1' },
    ],
    unread: 2,
  });
  assert.deepEqual(events, [
    ['reminders', { persist: true }],
    ['list', 'u-1', { limit: 30 }],
    ['render', 'nl', 'n-2'],
    ['render', 'nl', 'n-1'],
    ['unread', 'u-1'],
  ]);
});

test('notification routes marquent tout comme lu avant la sauvegarde', async () => {
  const events = [];
  const response = await requestNotifications({
    method: 'POST',
    path: '/read',
    auth: authenticated,
    notifications: {
      async markAllRead(userId) {
        events.push(['mark', userId]);
      },
    },
    runMatchingOfferReminders() {
      assert.fail('les rappels ne doivent pas etre executes');
    },
    renderNotification() {
      assert.fail('aucune notification ne doit etre rendue');
    },
    save() {
      events.push(['save']);
    },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { ok: true });
  assert.deepEqual(events, [
    ['mark', 'u-1'],
    ['save'],
  ]);
});

test('notification routes ne consultent pas le depot si auth refuse', async () => {
  let repositoryCalls = 0;
  const response = await requestNotifications({
    auth(_req, res) {
      res.status(401).json({ error: 'Non authentifié' });
    },
    notifications: {
      async listForUser() {
        repositoryCalls += 1;
        return [];
      },
      async unreadCount() {
        repositoryCalls += 1;
        return 0;
      },
    },
    runMatchingOfferReminders() {
      repositoryCalls += 1;
    },
    renderNotification() {
      repositoryCalls += 1;
      return '';
    },
    save() {
      repositoryCalls += 1;
    },
  });

  assert.equal(response.status, 401);
  assert.deepEqual(response.body, { error: 'Non authentifié' });
  assert.equal(repositoryCalls, 0);
});
