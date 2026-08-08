import assert from 'node:assert/strict';
import test from 'node:test';
import { verificationEmailCopy } from '../email.js';
import { langMiddleware } from '../middleware/language.js';

test('emails de verification : contenus complets dans les cinq langues', () => {
  for (const lang of ['fr', 'nl', 'ar', 'en', 'es']) {
    for (const purpose of ['verify', 'reset', 'change_email', 'delete_account']) {
      const copy = verificationEmailCopy({ code: '123456', purpose, lang });
      assert.equal(copy.lang, lang);
      assert.match(copy.title, /\S/);
      assert.match(copy.body, /123456/);
      assert.doesNotMatch(copy.body, /\{code\}/);
      assert.match(copy.footer, /\S/);
    }
  }
});

test('emails de verification : une langue inconnue revient au francais', () => {
  const copy = verificationEmailCopy({ code: '123456', purpose: 'verify', lang: 'xx' });
  assert.equal(copy.lang, 'fr');
  assert.match(copy.title, /adresse email/i);
});

test('API i18n : traduit aussi les confirmations visibles, pas seulement les erreurs', () => {
  const render = (lang, body) => {
    let output;
    const req = { headers: { 'accept-language': lang } };
    const res = { json: (value) => { output = value; } };
    langMiddleware(req, res, () => {});
    res.json(body);
    return output;
  };

  assert.equal(
    render('nl-BE', { message: 'Un code de verification vient d etre envoye.' }).message,
    'Er is zojuist een verificatiecode verzonden.',
  );
  assert.equal(
    render('ar-MA', { message: 'Un nouveau code vient d etre envoye.' }).message,
    'تم إرسال رمز جديد للتو.',
  );
  assert.equal(
    render('nl-BE', { error: 'Impossible d envoyer l email de verification' }).error,
    'De verificatie-e-mail kon niet worden verzonden',
  );
  assert.equal(
    render('en-GB', { message: 'Un code de verification vient d etre envoye.' }).message,
    'A verification code has just been sent.',
  );
  assert.equal(
    render('es-ES', { error: 'Impossible d envoyer l email de verification' }).error,
    'No se puede enviar el correo electrónico de verificación',
  );
});
