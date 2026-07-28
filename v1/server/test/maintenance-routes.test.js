import assert from 'node:assert/strict';
import express from 'express';
import test from 'node:test';
import { createMaintenanceRouter } from '../routes/maintenance.js';

async function requestMaintenance(path, { method = 'GET', overrides = {} } = {}) {
  const db = {
    messages: [{ attachments: [{ id: 'a-1', dataUrl: 'data:image/png;base64,YQ==' }] }],
    kycSubmissions: [{ selfiePhoto: 'data:image/png;base64,YQ==', idFrontPhoto: null }],
    users: [{ id: 'u-1', photoUrl: 'data:image/png;base64,YQ==' }],
  };
  const calls = [];
  const app = express();
  app.use((req, _res, next) => {
    req.requestId = 'req-maintenance-test';
    next();
  });
  app.use('/api', createMaintenanceRouter({
    auth: (req, _res, next) => { req.user = { id: 'u-admin' }; next(); },
    adminOnly: (_req, _res, next) => next(),
    db,
    messageMedia: { enabled: true },
    kycMedia: { enabled: true },
    profileMedia: { enabled: true },
    migrateMessageMedia: async ({ state }) => {
      delete state.messages[0].attachments[0].dataUrl;
      return { migrated: 1, skipped: 0 };
    },
    migrateKycMedia: async ({ state }) => {
      state.kycSubmissions[0].selfiePhoto = { storagePath: 'kyc/selfie.png' };
      return { migrated: 1, skipped: 0 };
    },
    migrateProfileMedia: async ({ state }) => {
      state.users[0].photoUrl = 'https://cdn.test/u-1.png';
      return { migrated: 1, skipped: 0 };
    },
    audit: async (...args) => calls.push(['audit', ...args]),
    save: () => calls.push(['save']),
    ...overrides,
  }));
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, { method });
    return { status: response.status, body: await response.json(), calls };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('maintenance expose seulement les compteurs non sensibles', async () => {
  const response = await requestMaintenance('/admin/maintenance');
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    maintenance: {
      inlineMessageAttachments: 1,
      inlineKycPhotos: 1,
      inlineProfilePhotos: 1,
      messageStorageConfigured: true,
      kycStorageConfigured: true,
      profileStorageConfigured: true,
    },
  });
});

test('maintenance migre separement KYC et avatars', async () => {
  const kyc = await requestMaintenance('/admin/maintenance/kyc-media', { method: 'POST' });
  assert.deepEqual(kyc.body, { ok: true, migrated: 1, remaining: 0 });

  const profile = await requestMaintenance('/admin/maintenance/profile-media', { method: 'POST' });
  assert.deepEqual(profile.body, { ok: true, migrated: 1, remaining: 0 });
});

test('maintenance media migre, audite puis sauvegarde', async () => {
  const response = await requestMaintenance('/admin/maintenance/message-media', { method: 'POST' });
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { ok: true, migrated: 1, remaining: 0 });
  assert.equal(response.calls[0][0], 'audit');
  assert.deepEqual(response.calls.at(-1), ['save']);
});

test('maintenance media refuse un stockage absent avant toute mutation', async () => {
  const response = await requestMaintenance('/admin/maintenance/message-media', {
    method: 'POST',
    overrides: { messageMedia: { enabled: false } },
  });
  assert.equal(response.status, 503);
  assert.equal(response.calls.length, 0);
});

test('maintenance media transforme une panne de stockage en reponse controlee', async () => {
  const originalError = console.error;
  console.error = () => {};
  try {
    const response = await requestMaintenance('/admin/maintenance/message-media', {
      method: 'POST',
      overrides: {
        migrateMessageMedia: async () => {
          throw new Error('storage offline');
        },
      },
    });
    assert.equal(response.status, 503);
    assert.deepEqual(response.body, {
      error: 'Migration des images indisponible',
      requestId: 'req-maintenance-test',
    });
    assert.equal(response.calls.length, 0);
  } finally {
    console.error = originalError;
  }
});
