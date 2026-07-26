import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { createObservability } from '../observability.js';

function response(statusCode = 200) {
  const res = new EventEmitter();
  res.statusCode = statusCode;
  res.headers = {};
  res.setHeader = (name, value) => { res.headers[name] = value; };
  res.getHeader = (name) => res.headers[name];
  res.status = (status) => { res.statusCode = status; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

test('observability mesure latence, erreurs et percentiles sans journaliser les succes', () => {
  let clock = 1_000;
  const entries = [];
  const observability = createObservability({
    now: () => clock,
    slowRequestMs: 100,
    logger: {
      log: (entry) => entries.push(entry),
      warn: (entry) => entries.push(entry),
      error: (entry) => entries.push(entry),
    },
  });

  const req = { method: 'GET', path: '/api/trips', headers: {}, requestId: 'req-1' };
  const res = response(200);
  observability.middleware(req, res, () => {});
  clock += 120;
  res.emit('finish');

  const failedReq = { method: 'POST', path: '/api/messages', headers: {}, requestId: 'req-2' };
  const failedRes = response(500);
  observability.middleware(failedReq, failedRes, () => {});
  clock += 30;
  failedRes.emit('finish');

  assert.deepEqual(observability.snapshot(), {
    release: 'local',
    environment: 'development',
    uptimeMs: 150,
    sampleSize: 2,
    failures: 1,
    failureRate: 0.5,
    latencyMs: { p50: 30, p95: 120, max: 120 },
    slowRequests: 1,
  });
  assert.equal(entries.length, 2);
  assert.match(entries[0], /http_request_slow/);
  assert.match(entries[1], /http_request_failed/);
});

test('observability transforme une erreur non geree en reponse tracable', () => {
  const entries = [];
  const observability = createObservability({
    logger: { error: (entry) => entries.push(JSON.parse(entry)) },
  });
  const req = { method: 'GET', path: '/api/fail', requestId: 'req-fail' };
  const res = response();

  observability.errorMiddleware(new Error('boom'), req, res, () => {});

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: 'Erreur interne', requestId: 'req-fail' });
  assert.equal(entries[0].event, 'unhandled_request_error');
  assert.equal(entries[0].requestId, 'req-fail');
});
