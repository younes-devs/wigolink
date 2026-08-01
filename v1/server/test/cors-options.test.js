import assert from 'node:assert/strict';
import test from 'node:test';
import { createCorsOptions } from '../config/cors-options.js';

function evaluateOrigin(options, origin) {
  let result;
  options.origin(origin, (error, allowed) => {
    result = { error, allowed };
  });
  return result;
}

test('CORS conserve les méthodes et en-têtes autorisés', () => {
  const options = createCorsOptions({
    isProduction: false,
    appOrigins: [],
  });

  assert.deepEqual(options.methods, ['GET', 'POST', 'PATCH', 'DELETE']);
  assert.deepEqual(options.allowedHeaders, ['Content-Type', 'Authorization', 'Accept-Language']);
});

test('CORS accepte toute origine et les requêtes sans origine hors production', () => {
  const options = createCorsOptions({
    isProduction: false,
    appOrigins: [],
  });

  assert.deepEqual(evaluateOrigin(options, 'http://localhost:5173'), {
    error: null,
    allowed: true,
  });
  assert.deepEqual(evaluateOrigin(options, undefined), {
    error: null,
    allowed: true,
  });
});

test('CORS accepte uniquement les origines configurées en production', () => {
  const options = createCorsOptions({
    isProduction: true,
    appOrigins: ['https://wigolink.app', 'https://admin.wigolink.app'],
  });

  assert.deepEqual(evaluateOrigin(options, 'https://wigolink.app'), {
    error: null,
    allowed: true,
  });
  const rejected = evaluateOrigin(options, 'https://example.com');
  assert.equal(rejected.allowed, undefined);
  assert.equal(rejected.error?.message, 'Origine non autorisee');
});

test('CORS accepte les appels serveur sans en-tête Origin en production', () => {
  const options = createCorsOptions({
    isProduction: true,
    appOrigins: [],
  });

  assert.deepEqual(evaluateOrigin(options, undefined), {
    error: null,
    allowed: true,
  });
});
