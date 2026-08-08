import assert from 'node:assert/strict';
import test from 'node:test';
import { sendSupportEmail } from '../email.js';

const env = {
  RESEND_API_KEY: 're_test',
  EMAIL_FROM: 'Wigolink <noreply@wigolink.com>',
  SUPPORT_EMAIL: 'support@wigolink.com',
};

test('email support est adressable par reponse et echappe le contenu HTML', async () => {
  let request;
  const result = await sendSupportEmail({
    ticketId: 'sup-123',
    user: { id: 'u-1', name: '<Younes>', email: 'YOUNES@example.com' },
    subject: 'Trajet <urgent>',
    message: 'Bonjour <script>alert(1)</script>\nMerci',
    lang: 'fr',
    env,
    async fetchImpl(url, options) {
      request = { url, options };
      return { ok: true, json: async () => ({ id: 'email-1' }) };
    },
  });

  const payload = JSON.parse(request.options.body);
  assert.deepEqual(result, { id: 'email-1' });
  assert.equal(request.url, 'https://api.resend.com/emails');
  assert.equal(request.options.headers['Idempotency-Key'], 'wigolink-support-sup-123');
  assert.deepEqual(payload.to, ['support@wigolink.com']);
  assert.equal(payload.reply_to, 'younes@example.com');
  assert.equal(payload.subject, '[Support sup-123] Trajet <urgent>');
  assert.match(payload.text, /Bonjour <script>alert\(1\)<\/script>/);
  assert.doesNotMatch(payload.html, /<script>/);
  assert.match(payload.html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(payload.html, /&lt;Younes&gt;/);
});

test('email support refuse une configuration incomplete', async () => {
  await assert.rejects(
    sendSupportEmail({
      ticketId: 'sup-123',
      user: { id: 'u-1', email: 'user@example.com' },
      subject: 'Sujet valide',
      message: 'Message suffisamment detaille.',
      env: {},
      fetchImpl: async () => assert.fail('aucun appel reseau attendu'),
    }),
    /Service email indisponible/,
  );
});
