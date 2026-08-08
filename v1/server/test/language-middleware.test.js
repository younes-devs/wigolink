import assert from 'node:assert/strict';
import test from 'node:test';
import { langMiddleware, translateError } from '../middleware/language.js';

function runMiddleware(acceptLanguage, body) {
  let output;
  let nextCalled = false;
  const req = { headers: { 'accept-language': acceptLanguage } };
  const res = {
    json(value) {
      output = value;
      return value;
    },
  };

  langMiddleware(req, res, () => {
    nextCalled = true;
  });
  const result = res.json(body);

  return { req, output, result, nextCalled };
}

test('language middleware utilise la première langue supportée et appelle next', () => {
  const rendered = runMiddleware('nl-BE,nl;q=0.9,fr;q=0.8', {
    error: 'Réservé aux admins',
  });

  assert.equal(rendered.req.lang, 'nl');
  assert.equal(rendered.nextCalled, true);
  assert.equal(rendered.output.error, 'Enkel voor admins');
  assert.equal(rendered.result, rendered.output);
});

test('language middleware revient au français et préserve le corps source', () => {
  const source = {
    message: 'Un code de verification vient d etre envoye.',
    untouched: 42,
  };
  const rendered = runMiddleware('de-DE', source);

  assert.equal(rendered.req.lang, 'fr');
  assert.deepEqual(rendered.output, source);
  assert.notEqual(rendered.output, source);
  assert.deepEqual(source, {
    message: 'Un code de verification vient d etre envoye.',
    untouched: 42,
  });
});

test('translateError conserve les messages inconnus', () => {
  assert.equal(translateError('nl', 'Message métier inconnu'), 'Message métier inconnu');
});

test('language middleware accepte anglais et espagnol', () => {
  const english = runMiddleware('en-GB,en;q=0.9', { error: 'Réservé aux admins' });
  const spanish = runMiddleware('es-ES,es;q=0.9', { error: 'Réservé aux admins' });

  assert.equal(english.req.lang, 'en');
  assert.equal(english.output.error, 'Reserved for admins');
  assert.equal(spanish.req.lang, 'es');
  assert.equal(spanish.output.error, 'Reservado para administradores');
});
