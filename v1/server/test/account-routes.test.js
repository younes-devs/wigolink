import assert from 'node:assert/strict';
import express from 'express';
import test from 'node:test';
import { createAccountRouter } from '../routes/account.js';

async function requestAccount({
  auth,
  publicUser,
  kycUserView,
}) {
  const app = express();
  app.use('/api', createAccountRouter({
    auth,
    publicUser,
    kycUserView,
  }));
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });

  try {
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/api/me`);
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

test('account route expose le contrat prive complet du membre authentifie', async () => {
  const user = {
    id: 'u-1',
    name: 'Membre',
    email: 'membre@example.test',
    provider: 'email',
    phone: '+32000000000',
    maxValue: 500,
    maxActive: 4,
    trainingDone: 1,
    kycStatus: 'pending',
  };
  let projectedUser;
  let projectedKycUser;
  const response = await requestAccount({
    auth(req, _res, next) {
      req.user = user;
      next();
    },
    publicUser(candidate) {
      projectedUser = candidate;
      return {
        id: candidate.id,
        name: candidate.name,
        kycStatus: candidate.kycStatus,
      };
    },
    kycUserView(candidate) {
      projectedKycUser = candidate;
      return {
        status: candidate.kycStatus,
        attempts: 2,
        canResubmit: false,
      };
    },
  });

  assert.equal(response.status, 200);
  assert.equal(projectedUser, user);
  assert.equal(projectedKycUser, user);
  assert.deepEqual(response.body, {
    user: {
      id: user.id,
      name: user.name,
      kycStatus: user.kycStatus,
    },
    email: user.email,
    provider: user.provider,
    phone: user.phone,
    maxValue: user.maxValue,
    maxActive: user.maxActive,
    trainingDone: true,
    kycStatus: user.kycStatus,
    kyc: {
      status: user.kycStatus,
      attempts: 2,
      canResubmit: false,
    },
  });
});

test('account route ne projette aucune donnee lorsque auth refuse la requete', async () => {
  const response = await requestAccount({
    auth(_req, res) {
      res.status(401).json({ error: 'Non authentifie' });
    },
    publicUser() {
      assert.fail('la projection publique ne doit pas etre appelee');
    },
    kycUserView() {
      assert.fail('la projection KYC ne doit pas etre appelee');
    },
  });

  assert.equal(response.status, 401);
  assert.deepEqual(response.body, { error: 'Non authentifie' });
});
