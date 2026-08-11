import assert from 'node:assert/strict';
import express from 'express';
import test from 'node:test';
import { createProfileRouter } from '../routes/profile.js';

async function requestProfile({
  path = '/',
  body = {},
  user = {
    id: 'u-1',
    name: 'Ancien nom',
    city: 'Bruxelles',
    phone: '',
    photoUrl: null,
  },
  auth,
  auditChange,
  save,
  persistUser,
  publicUser,
  verifyPassword,
  hashPassword,
  clearUserSessions,
  accountEmail,
  profileMedia,
  memberMediaUploads,
}) {
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.use('/api/profile', createProfileRouter({
    auth: auth || ((req, _res, next) => {
      req.user = user;
      next();
    }),
    auditChange,
    save,
    persistUser,
    publicUser,
    verifyPassword,
    hashPassword,
    clearUserSessions,
    accountEmail,
    profileMedia,
    memberMediaUploads,
  }));
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });

  try {
    const address = server.address();
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/profile${path}`,
      {
        method: 'POST',
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

test('profile route applique, audite, sauvegarde puis projette la modification', async () => {
  const user = {
    id: 'u-1',
    name: 'Ancien nom',
    city: 'Bruxelles',
    phone: '',
    isAdmin: false,
  };
  const events = [];
  let auditPayload;
  const response = await requestProfile({
    user,
    body: {
      name: '  Nouveau nom  ',
      city: '  Oujda  ',
      phone: '  0600000000  ',
      isAdmin: true,
    },
    async auditChange(payload) {
      events.push('audit');
      auditPayload = payload;
    },
    save() {
      events.push('save');
    },
    publicUser(candidate) {
      events.push('project');
      return {
        id: candidate.id,
        name: candidate.name,
        city: candidate.city,
        phone: candidate.phone,
      };
    },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(events, ['audit', 'save', 'project']);
  assert.equal(user.isAdmin, false);
  assert.deepEqual(response.body.user, {
    id: user.id,
    name: 'Nouveau nom',
    city: 'Oujda',
    phone: '0600000000',
  });
  assert.deepEqual(auditPayload, {
    actorId: user.id,
    action: 'profile.update',
    targetType: 'user',
    targetId: user.id,
    subjectUserId: user.id,
    before: {
      id: user.id,
      name: 'Ancien nom',
      city: 'Bruxelles',
      phone: '',
      isAdmin: false,
    },
    after: user,
    fields: ['name', 'city', 'phone'],
  });
});

test('profile route persiste directement la modification en mode relationnel', async () => {
  const user = {
    id: 'u-1',
    name: 'Ancien nom',
    city: 'Bruxelles',
    phone: '',
  };
  let persisted;
  const response = await requestProfile({
    user,
    body: { name: 'Nouveau nom', city: 'Oujda', phone: '0600000000' },
    async auditChange() {},
    save() {
      assert.fail('la sauvegarde globale ne doit pas etre utilisee');
    },
    async persistUser(candidate, before) {
      persisted = { candidate: { ...candidate }, before };
    },
    publicUser(candidate) {
      return { id: candidate.id, name: candidate.name, city: candidate.city };
    },
  });

  assert.equal(response.status, 200);
  assert.equal(persisted.candidate.name, 'Nouveau nom');
  assert.equal(persisted.candidate.city, 'Oujda');
  assert.equal(persisted.before.name, 'Ancien nom');
});

test('profile photo route finalise un upload direct puis retire l ancien objet', async () => {
  const user = { id: 'u-1', photoUrl: 'https://cdn.test/old.jpg' };
  const events = [];
  const response = await requestProfile({
    path: '/photo',
    body: { uploadId: 'media-1' },
    user,
    memberMediaUploads: {
      async claimProfile() {
        events.push('claim');
        return { uploadId: 'media-1', url: 'https://cdn.test/new.jpg' };
      },
      async complete() { events.push('complete'); },
    },
    profileMedia: {
      async removePublicUrl(_userId, url) { events.push(`remove:${url}`); },
    },
    async auditChange() { events.push('audit'); },
    save() { events.push('save'); },
    publicUser(candidate) { return { id: candidate.id, photoUrl: candidate.photoUrl }; },
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.user.photoUrl, 'https://cdn.test/new.jpg');
  assert.deepEqual(events, [
    'claim', 'audit', 'save', 'complete', 'remove:https://cdn.test/old.jpg',
  ]);
});

test('profile photo route persiste l URL publique en mode relationnel', async () => {
  const user = { id: 'u-1', photoUrl: null };
  let persisted;
  const response = await requestProfile({
    path: '/photo',
    body: { uploadId: 'media-1' },
    user,
    memberMediaUploads: {
      async claimProfile() {
        return { uploadId: 'media-1', url: 'https://cdn.test/new.jpg' };
      },
      async complete() {},
    },
    profileMedia: { async removePublicUrl() {} },
    async auditChange() {},
    save() {
      assert.fail('la sauvegarde globale ne doit pas etre utilisee');
    },
    async persistUser(candidate, before) {
      persisted = { candidate: { ...candidate }, before };
    },
    publicUser(candidate) {
      return { id: candidate.id, photoUrl: candidate.photoUrl };
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.user.photoUrl, 'https://cdn.test/new.jpg');
  assert.equal(persisted.candidate.photoUrl, 'https://cdn.test/new.jpg');
  assert.equal(persisted.before.photoUrl, null);
});

test('profile photo route reserve une URL signee sans recevoir le fichier', async () => {
  const response = await requestProfile({
    path: '/photo/upload',
    body: { mime: 'image/jpeg', size: 1234 },
    memberMediaUploads: {
      async reserveProfile(payload) {
        assert.deepEqual(payload, {
          userId: 'u-1', mime: 'image/jpeg', size: 1234,
        });
        return { uploadId: 'media-1', upload: { signedUrl: 'https://upload.test' } };
      },
    },
  });
  assert.equal(response.status, 200);
  assert.equal(response.body.uploadId, 'media-1');
});

test('profile photo route annule l upload direct si la sauvegarde echoue', async () => {
  const user = { id: 'u-1', photoUrl: 'https://cdn.test/old.jpg' };
  const events = [];
  const response = await requestProfile({
    path: '/photo',
    body: { uploadId: 'media-1' },
    user,
    memberMediaUploads: {
      async claimProfile() {
        events.push('claim');
        return { uploadId: 'media-1', url: 'https://cdn.test/new.jpg' };
      },
      async cancel(uploadId) { events.push(`cancel:${uploadId}`); },
    },
    profileMedia: {},
    async auditChange() { events.push('audit'); },
    async save() { throw new Error('database unavailable'); },
    publicUser() { assert.fail('aucune projection ne doit etre calculee'); },
  });

  assert.equal(response.status, 503);
  assert.equal(user.photoUrl, 'https://cdn.test/old.jpg');
  assert.deepEqual(events, ['claim', 'audit', 'cancel:media-1']);
});

test('profile route refuse un nom court sans mutation', async () => {
  const user = { id: 'u-1', name: 'Nom valide' };
  const response = await requestProfile({
    user,
    body: { name: ' ' },
    auditChange() {
      assert.fail('aucun audit ne doit etre cree');
    },
    save() {
      assert.fail('aucune sauvegarde ne doit avoir lieu');
    },
    publicUser() {
      assert.fail('aucune projection ne doit etre calculee');
    },
  });

  assert.equal(response.status, 400);
  assert.equal(user.name, 'Nom valide');
  assert.deepEqual(response.body, { error: 'Nom trop court' });
});

for (const [label, initialPhoto, dataUrl, expectedPhoto, expectedHasPhoto] of [
  ['ajout', null, 'data:image/webp;base64,AAAA', 'data:image/webp;base64,AAAA', true],
  ['suppression', 'data:image/png;base64,AAAA', null, null, false],
]) {
  test(`profile photo route conserve l audit lors de l ${label}`, async () => {
    const user = { id: 'u-1', photoUrl: initialPhoto };
    const events = [];
    let auditPayload;
    const response = await requestProfile({
      path: '/photo',
      body: { dataUrl },
      user,
      async auditChange(payload) {
        events.push('audit');
        auditPayload = payload;
      },
      save() {
        events.push('save');
      },
      publicUser(candidate) {
        events.push('project');
        return { id: candidate.id, photoUrl: candidate.photoUrl };
      },
    });

    assert.equal(response.status, 200);
    assert.deepEqual(events, ['audit', 'save', 'project']);
    assert.equal(user.photoUrl, expectedPhoto);
    assert.deepEqual(auditPayload, {
      actorId: user.id,
      action: 'profile.photo.update',
      targetType: 'user',
      targetId: user.id,
      subjectUserId: user.id,
      before: { hasPhoto: !!initialPhoto },
      after: { hasPhoto: expectedHasPhoto },
      fields: ['hasPhoto'],
    });
  });
}

test('profile photo route refuse une image invalide avant tout effet', async () => {
  const user = { id: 'u-1', photoUrl: null };
  const response = await requestProfile({
    path: '/photo',
    body: { dataUrl: 'data:image/gif;base64,AAAA' },
    user,
    auditChange() {
      assert.fail('aucun audit ne doit etre cree');
    },
    save() {
      assert.fail('aucune sauvegarde ne doit avoir lieu');
    },
    publicUser() {
      assert.fail('aucune projection ne doit etre calculee');
    },
  });

  assert.equal(response.status, 400);
  assert.equal(user.photoUrl, null);
  assert.deepEqual(response.body, {
    error: 'Format d\'image invalide (JPEG, PNG ou WebP)',
  });
});

test('profile routes ne calculent rien lorsque auth refuse', async () => {
  const response = await requestProfile({
    auth(_req, res) {
      res.status(401).json({ error: 'Non authentifie' });
    },
    auditChange() {
      assert.fail('aucun audit ne doit etre cree');
    },
    save() {
      assert.fail('aucune sauvegarde ne doit avoir lieu');
    },
    publicUser() {
      assert.fail('aucune projection ne doit etre calculee');
    },
  });

  assert.equal(response.status, 401);
  assert.deepEqual(response.body, { error: 'Non authentifie' });
});

test('profile password route remplace le hash et invalide les sessions avant l audit', async () => {
  const user = { id: 'u-1', passwordHash: 'hash-actuel' };
  const events = [];
  let auditPayload;
  const response = await requestProfile({
    path: '/password',
    body: {
      currentPassword: 'ancien-secret',
      password: 'nouveau-secret',
    },
    user,
    verifyPassword(password, hash) {
      events.push('verify');
      return password === 'ancien-secret' && hash === 'hash-actuel';
    },
    hashPassword(password) {
      events.push('hash');
      assert.equal(password, 'nouveau-secret');
      return 'nouveau-hash';
    },
    async clearUserSessions(userId) {
      events.push('sessions');
      assert.equal(userId, user.id);
    },
    async auditChange(payload) {
      events.push('audit');
      auditPayload = payload;
    },
    save() {
      events.push('save');
    },
    publicUser() {
      assert.fail('la route mot de passe ne projette pas le profil');
    },
  });

  assert.equal(response.status, 200);
  assert.equal(user.passwordHash, 'nouveau-hash');
  assert.deepEqual(events, ['verify', 'hash', 'sessions', 'audit', 'save']);
  assert.deepEqual(auditPayload, {
    actorId: user.id,
    action: 'profile.password.update',
    targetType: 'user',
    targetId: user.id,
    subjectUserId: user.id,
    before: {},
    after: {},
    fields: [],
    meta: { recordEmpty: true },
  });
  assert.deepEqual(response.body, { ok: true, mustRelogin: true });
});

test('profile password route ne modifie rien si le secret courant est faux', async () => {
  const user = { id: 'u-1', passwordHash: 'hash-actuel' };
  const response = await requestProfile({
    path: '/password',
    body: {
      currentPassword: 'incorrect',
      password: 'nouveau-secret',
    },
    user,
    verifyPassword() {
      return false;
    },
    hashPassword() {
      assert.fail('le nouveau secret ne doit pas etre hache');
    },
    clearUserSessions() {
      assert.fail('les sessions ne doivent pas etre modifiees');
    },
    auditChange() {
      assert.fail('aucun audit ne doit etre cree');
    },
    save() {
      assert.fail('aucune sauvegarde ne doit avoir lieu');
    },
    publicUser() {
      assert.fail('aucune projection ne doit etre calculee');
    },
  });

  assert.equal(response.status, 400);
  assert.equal(user.passwordHash, 'hash-actuel');
  assert.deepEqual(response.body, {
    error: 'Mot de passe actuel incorrect',
  });
});

test('profile email routes deleguent la demande et la confirmation au service', async () => {
  const user = { id: 'u-1', email: 'ancien@example.test' };
  const calls = [];
  const accountEmail = {
    async requestChange(input) {
      calls.push(['request', input]);
      return { value: { ok: true, demoHint: 'code-demo' } };
    },
    async confirmChange(input) {
      calls.push(['confirm', input]);
      return { value: { ok: true, mustRelogin: true } };
    },
  };
  const request = await requestProfile({
    path: '/email/change/request',
    body: { newEmail: 'nouveau@example.test', currentPassword: 'secret' },
    user,
    accountEmail,
  });
  const confirmation = await requestProfile({
    path: '/email/change/confirm',
    body: { code: '123456' },
    user,
    accountEmail,
  });

  assert.equal(request.status, 200);
  assert.deepEqual(request.body, { ok: true, demoHint: 'code-demo' });
  assert.equal(confirmation.status, 200);
  assert.deepEqual(confirmation.body, { ok: true, mustRelogin: true });
  assert.deepEqual(calls, [
    ['request', {
      user,
      body: {
        newEmail: 'nouveau@example.test',
        currentPassword: 'secret',
      },
      lang: undefined,
    }],
    ['confirm', {
      user,
      body: { code: '123456' },
    }],
  ]);
});

test('profile email route transmet le statut d erreur du service', async () => {
  const response = await requestProfile({
    path: '/email/change/request',
    body: { newEmail: 'invalide' },
    accountEmail: {
      async requestChange() {
        return { status: 429, error: 'Trop de demandes' };
      },
      async confirmChange() {
        assert.fail('la confirmation ne doit pas etre appelee');
      },
    },
  });

  assert.equal(response.status, 429);
  assert.deepEqual(response.body, { error: 'Trop de demandes' });
});
