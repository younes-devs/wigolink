import assert from 'node:assert/strict';
import express from 'express';
import test from 'node:test';
import { createTrainingRouter } from '../routes/training.js';
import { invalidTrainingAnswers } from '../validators/training.js';

async function requestTraining({
  body,
  auth,
  save,
  validateAnswers,
}) {
  const app = express();
  app.use(express.json());
  app.use('/api/training', createTrainingRouter({
    auth,
    save,
    validateAnswers,
  }));
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });

  try {
    const address = server.address();
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/training/complete`,
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

test('training validator conserve les trois reponses attendues et leur ordre', () => {
  assert.deepEqual(invalidTrainingAnswers({ q1: 'b', q2: 'c', q3: 'a' }), []);
  assert.deepEqual(invalidTrainingAnswers({ q1: 'x', q3: 'a' }), ['q1', 'q2']);
  assert.deepEqual(invalidTrainingAnswers({}), ['q1', 'q2', 'q3']);
});

test('training routes refusent les reponses incorrectes sans modifier le membre', async () => {
  const user = { id: 'u-1', trainingDone: false };
  const response = await requestTraining({
    body: { answers: { q1: 'b', q2: 'x', q3: 'a' } },
    auth(req, _res, next) {
      req.user = user;
      next();
    },
    save() {
      assert.fail('une tentative incorrecte ne doit pas etre sauvegardee');
    },
  });

  assert.equal(response.status, 400);
  assert.deepEqual(response.body, {
    error: 'Certaines réponses sont incorrectes — relisez les règles.',
    wrong: ['q2'],
  });
  assert.equal(user.trainingDone, false);
});

test('training routes valident le membre avant de sauvegarder', async () => {
  const user = { id: 'u-1', trainingDone: false };
  let saveCalls = 0;
  const response = await requestTraining({
    body: { answers: { q1: 'b', q2: 'c', q3: 'a' } },
    auth(req, _res, next) {
      req.user = user;
      next();
    },
    save() {
      saveCalls += 1;
      assert.equal(user.trainingDone, true);
    },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { ok: true });
  assert.equal(user.trainingDone, true);
  assert.equal(saveCalls, 1);
});

test('training routes ne valident rien si auth refuse', async () => {
  let validationCalls = 0;
  const response = await requestTraining({
    body: { answers: { q1: 'b', q2: 'c', q3: 'a' } },
    auth(_req, res) {
      res.status(401).json({ error: 'Non authentifié' });
    },
    validateAnswers() {
      validationCalls += 1;
      return [];
    },
    save() {
      assert.fail('save ne doit pas etre appele');
    },
  });

  assert.equal(response.status, 401);
  assert.deepEqual(response.body, { error: 'Non authentifié' });
  assert.equal(validationCalls, 0);
});
