import assert from 'node:assert/strict';
import express from 'express';
import test from 'node:test';
import { createAccountSettingsRouter } from '../routes/account-settings.js';

async function requestAccountSettings({
  method = 'GET',
  path = '/settings',
  body,
  auth,
  settings,
  auditChange,
  publicUser,
  save,
}) {
  const app = express();
  app.use(express.json());
  app.use('/api', createAccountSettingsRouter({
    auth,
    settings,
    auditChange,
    publicUser,
    save,
  }));
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });

  try {
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/api${path}`, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
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

function createAuthenticatedUser() {
  return {
    id: 'u-1',
    name: 'Membre',
    settings: {
      notifications: {
        transactions: true,
        messages: true,
        shipments: true,
        reminders: true,
        security: true,
      },
    },
  };
}

function authFor(user) {
  return (req, _res, next) => {
    req.user = user;
    next();
  };
}

test('account settings routes lisent les preferences du membre authentifie', async () => {
  const user = createAuthenticatedUser();
  let ensuredUser;
  const response = await requestAccountSettings({
    auth: authFor(user),
    settings: {
      ensure(candidate) {
        ensuredUser = candidate;
        return candidate.settings;
      },
    },
    auditChange() {
      assert.fail('aucun audit ne doit etre cree pendant la lecture');
    },
    publicUser() {
      assert.fail('le profil public ne doit pas etre calcule');
    },
    save() {
      assert.fail('la lecture ne doit pas sauvegarder');
    },
  });

  assert.equal(response.status, 200);
  assert.equal(ensuredUser, user);
  assert.deepEqual(response.body, { settings: user.settings });
});

test('account settings routes auditent puis sauvegardent la mise a jour', async () => {
  const user = createAuthenticatedUser();
  const events = [];
  let auditPayload;
  const settings = {
    ensure(candidate) {
      return candidate.settings;
    },
    updateNotifications(candidate, input) {
      events.push('update');
      candidate.settings.notifications = {
        ...candidate.settings.notifications,
        messages: !!input.messages,
        security: true,
      };
    },
  };
  const response = await requestAccountSettings({
    method: 'POST',
    body: { notifications: { messages: false } },
    auth: authFor(user),
    settings,
    async auditChange(payload) {
      events.push('audit');
      auditPayload = payload;
    },
    publicUser() {
      assert.fail('le profil public ne doit pas etre calcule');
    },
    save() {
      events.push('save');
    },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(events, ['update', 'audit', 'save']);
  assert.deepEqual(auditPayload, {
    actorId: user.id,
    action: 'settings.notifications.update',
    targetType: 'user',
    targetId: user.id,
    subjectUserId: user.id,
    before: {
      transactions: true,
      messages: true,
      shipments: true,
      reminders: true,
      security: true,
    },
    after: {
      transactions: true,
      messages: false,
      shipments: true,
      reminders: true,
      security: true,
    },
    fields: ['transactions', 'messages', 'shipments', 'reminders'],
  });
  assert.equal(response.body.settings.notifications.messages, false);
  assert.equal(response.body.settings.notifications.security, true);
});

test('account settings routes terminent l onboarding avant de repondre', async () => {
  const user = createAuthenticatedUser();
  const events = [];
  const response = await requestAccountSettings({
    method: 'POST',
    path: '/onboarding/complete',
    auth: authFor(user),
    settings: {
      markOnboardingDone(candidate) {
        events.push('onboarding');
        candidate.settings.onboardingDone = true;
      },
      ensure(candidate) {
        return candidate.settings;
      },
    },
    auditChange() {
      assert.fail('cet endpoint ne cree pas d audit');
    },
    publicUser(candidate) {
      events.push('publicUser');
      return { id: candidate.id, onboardingDone: true };
    },
    save() {
      events.push('save');
    },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(events, ['onboarding', 'save', 'publicUser']);
  assert.deepEqual(response.body, {
    user: { id: user.id, onboardingDone: true },
    settings: {
      ...user.settings,
      onboardingDone: true,
    },
  });
});
