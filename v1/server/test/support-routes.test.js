import assert from 'node:assert/strict';
import express from 'express';
import test from 'node:test';
import { createSupportRouter } from '../routes/support.js';

async function requestSupport({
  body = { subject: 'Probleme de livraison', message: 'Je rencontre un probleme avec ma livraison.' },
  auth,
  rateLimit = async () => false,
  sendEmail = async () => {},
  audit = async () => {},
  newId = () => 'sup-123',
}) {
  const app = express();
  app.use(express.json());
  app.use('/api', createSupportRouter({ auth, rateLimit, sendEmail, audit, newId }));
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });

  try {
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/api/support`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

const user = { id: 'u-1', name: 'Younes', email: 'younes@example.com' };
const auth = (req, _res, next) => {
  req.user = user;
  req.lang = 'fr';
  next();
};

test('support exige un membre authentifie', async () => {
  let sent = false;
  const response = await requestSupport({
    auth(_req, res) { res.status(401).json({ error: 'Non authentifie' }); },
    sendEmail: async () => { sent = true; },
  });

  assert.equal(response.status, 401);
  assert.equal(sent, false);
});

test('support refuse un sujet ou un message invalide', async () => {
  const shortSubject = await requestSupport({ auth, body: { subject: 'abc', message: 'Un message suffisamment detaille pour le support.' } });
  const shortMessage = await requestSupport({ auth, body: { subject: 'Sujet valide', message: 'Trop court' } });

  assert.equal(shortSubject.status, 400);
  assert.equal(shortSubject.body.code, 'invalid_subject');
  assert.equal(shortMessage.status, 400);
  assert.equal(shortMessage.body.code, 'invalid_message');
});

test('support nettoie, envoie et audite la demande', async () => {
  const events = [];
  let emailPayload;
  let auditPayload;
  const response = await requestSupport({
    auth,
    body: {
      subject: '  Probleme   avec mon trajet  ',
      message: '  Premiere ligne\r\nDeuxieme ligne avec suffisamment de details.  ',
    },
    async sendEmail(payload) {
      events.push('email');
      emailPayload = payload;
    },
    async audit(...payload) {
      events.push('audit');
      auditPayload = payload;
    },
  });

  assert.equal(response.status, 201);
  assert.deepEqual(response.body, { ok: true, ticketId: 'sup-123' });
  assert.deepEqual(events, ['email', 'audit']);
  assert.deepEqual(emailPayload, {
    ticketId: 'sup-123',
    user,
    subject: 'Probleme avec mon trajet',
    message: 'Premiere ligne\nDeuxieme ligne avec suffisamment de details.',
    lang: 'fr',
  });
  assert.deepEqual(auditPayload, [
    'u-1',
    'support.request.create',
    'support_request',
    'sup-123',
    { subject: 'Probleme avec mon trajet', subjectUserId: 'u-1' },
  ]);
});

test('support limite les envois repetes', async () => {
  let sent = false;
  const response = await requestSupport({
    auth,
    rateLimit: async (key) => {
      assert.equal(key, 'support:u-1');
      return true;
    },
    sendEmail: async () => { sent = true; },
  });

  assert.equal(response.status, 429);
  assert.equal(sent, false);
});

test('support ne cree pas d audit si l email echoue', async () => {
  let audited = false;
  const originalError = console.error;
  console.error = () => {};
  try {
    const response = await requestSupport({
      auth,
      sendEmail: async () => { throw new Error('Resend indisponible'); },
      audit: async () => { audited = true; },
    });
    assert.equal(response.status, 502);
    assert.equal(response.body.code, 'support_unavailable');
    assert.equal(audited, false);
  } finally {
    console.error = originalError;
  }
});
