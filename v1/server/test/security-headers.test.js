import assert from 'node:assert/strict';
import test from 'node:test';
import { createSecurityHeaders } from '../middleware/security-headers.js';

function runMiddleware({
  requestId,
  generatedId = 'req-generated',
  supabaseUrl = '',
  supabaseRealtimeOrigin = '',
} = {}) {
  const headers = {};
  let generatorCalls = 0;
  let nextCalled = false;
  const middleware = createSecurityHeaders({
    newRequestId() {
      generatorCalls += 1;
      return generatedId;
    },
    supabaseUrl,
    supabaseRealtimeOrigin,
  });
  const req = { headers: requestId ? { 'x-request-id': requestId } : {} };
  const res = {
    setHeader(name, value) {
      headers[name] = value;
    },
  };

  middleware(req, res, () => {
    nextCalled = true;
  });

  return { headers, generatorCalls, nextCalled, req };
}

test('security headers réutilise le request-id fourni', () => {
  const result = runMiddleware({ requestId: 'req-upstream' });

  assert.equal(result.nextCalled, true);
  assert.equal(result.generatorCalls, 0);
  assert.equal(result.headers['X-Request-Id'], 'req-upstream');
  assert.equal(result.req.requestId, 'req-upstream');
  assert.equal(result.headers['X-Content-Type-Options'], 'nosniff');
  assert.equal(result.headers['X-Frame-Options'], 'DENY');
  assert.equal(result.headers['Referrer-Policy'], 'strict-origin-when-cross-origin');
  assert.equal(result.headers['Permissions-Policy'], 'camera=(self), microphone=(), geolocation=()');
});

test('security headers génère un request-id et une CSP locale par défaut', () => {
  const result = runMiddleware();

  assert.equal(result.generatorCalls, 1);
  assert.equal(result.headers['X-Request-Id'], 'req-generated');
  assert.equal(
    result.headers['Content-Security-Policy'],
    "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' https://accounts.google.com; frame-src https://accounts.google.com; connect-src 'self' https://accounts.google.com; font-src 'self' data:",
  );
});

test('security headers autorise les origines Supabase HTTP et realtime', () => {
  const result = runMiddleware({
    supabaseUrl: 'https://project.supabase.co',
    supabaseRealtimeOrigin: 'wss://project.supabase.co',
  });

  assert.match(
    result.headers['Content-Security-Policy'],
    /connect-src 'self' https:\/\/accounts\.google\.com https:\/\/project\.supabase\.co wss:\/\/project\.supabase\.co;/,
  );
});
