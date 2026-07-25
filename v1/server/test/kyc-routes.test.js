import assert from 'node:assert/strict';
import express from 'express';
import test from 'node:test';
import { createKycRouter } from '../routes/kyc.js';

const VALID_BODY = {
  legalName: '  Membre KYC  ',
  birthDate: '1990-01-01',
  documentType: 'passport',
  selfiePhoto: 'valid-photo',
  idFrontPhoto: 'valid-photo',
};

async function requestKyc({
  user = { id: 'u-1', kycStatus: 'none' },
  auth,
  kycRepository,
  save,
  kycUserView,
  validPhotos = (photos) => photos.every((photo) => photo === 'valid-photo'),
  maxAttempts = 3,
  body = VALID_BODY,
}) {
  const app = express();
  app.use(express.json());
  app.use('/api/kyc', createKycRouter({
    auth: auth || ((req, _res, next) => {
      req.user = user;
      next();
    }),
    kycRepository,
    save,
    kycUserView,
    validPhotos,
    maxAttempts,
  }));
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });

  try {
    const address = server.address();
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/kyc/submit`,
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

test('KYC route enregistre puis sauvegarde une soumission valide', async () => {
  const user = { id: 'u-1', kycStatus: 'none' };
  const events = [];
  let submission;
  const response = await requestKyc({
    user,
    kycRepository: {
      rejectedCountForUser(userId) {
        events.push('count');
        assert.equal(userId, user.id);
        return 0;
      },
      appendSubmission(value) {
        events.push('append');
        submission = value;
      },
    },
    save() {
      events.push('save');
    },
    kycUserView(candidate) {
      events.push('view');
      assert.equal(candidate, user);
      return { status: candidate.kycStatus, attempts: 1 };
    },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(events, ['count', 'append', 'save', 'view']);
  assert.equal(user.kycStatus, 'pending');
  assert.deepEqual(submission, {
    userId: user.id,
    legalName: 'Membre KYC',
    birthDate: '1990-01-01',
    age: 36,
    documentType: 'passport',
    selfiePhoto: 'valid-photo',
    idFrontPhoto: 'valid-photo',
    idBackPhoto: null,
  });
  assert.deepEqual(response.body, {
    kyc: { status: 'pending', attempts: 1 },
  });
});

for (const [kycStatus, expectedStatus, error] of [
  ['verified', 400, 'Votre identité est déjà vérifiée'],
  ['pending', 400, 'Une demande est déjà en cours de vérification'],
  ['refused', 403, 'Vérification définitivement refusée — contactez le support'],
]) {
  test(`KYC route bloque immediatement le statut ${kycStatus}`, async () => {
    const response = await requestKyc({
      user: { id: 'u-1', kycStatus },
      kycRepository: {
        rejectedCountForUser() {
          assert.fail('le depot ne doit pas etre consulte');
        },
        appendSubmission() {
          assert.fail('aucune soumission ne doit etre ajoutee');
        },
      },
      save() {
        assert.fail('aucune sauvegarde ne doit avoir lieu');
      },
      kycUserView() {
        assert.fail('aucune vue KYC ne doit etre calculee');
      },
    });

    assert.equal(response.status, expectedStatus);
    assert.deepEqual(response.body, { error });
  });
}

test('KYC route refuse une quatrieme tentative sans mutation', async () => {
  const user = { id: 'u-1', kycStatus: 'rejected' };
  const response = await requestKyc({
    user,
    kycRepository: {
      rejectedCountForUser() {
        return 3;
      },
      appendSubmission() {
        assert.fail('aucune soumission ne doit etre ajoutee');
      },
    },
    save() {
      assert.fail('aucune sauvegarde ne doit avoir lieu');
    },
    kycUserView() {
      assert.fail('aucune vue KYC ne doit etre calculee');
    },
  });

  assert.equal(response.status, 403);
  assert.equal(user.kycStatus, 'rejected');
  assert.deepEqual(response.body, {
    error: 'Nombre maximum de tentatives atteint — contactez le support',
  });
});

test('KYC route ne consulte rien lorsque auth refuse la requete', async () => {
  const response = await requestKyc({
    auth(_req, res) {
      res.status(401).json({ error: 'Non authentifie' });
    },
    kycRepository: {
      rejectedCountForUser() {
        assert.fail('le depot ne doit pas etre consulte');
      },
      appendSubmission() {
        assert.fail('le depot ne doit pas etre modifie');
      },
    },
    save() {
      assert.fail('aucune sauvegarde ne doit avoir lieu');
    },
    kycUserView() {
      assert.fail('aucune vue KYC ne doit etre calculee');
    },
  });

  assert.equal(response.status, 401);
  assert.deepEqual(response.body, { error: 'Non authentifie' });
});
