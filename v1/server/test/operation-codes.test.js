import assert from 'node:assert/strict';
import test from 'node:test';
import { createOperationCodeService } from '../services/operation-codes.js';

test('codes operation: emission, projection publique et verification', () => {
  let currentTime = 1_000;
  const service = createOperationCodeService({
    secret: 'test-secret',
    now: () => currentTime,
  });
  const transaction = { id: 'tx-1' };

  const code = service.issue(transaction, 'pickup', 'u-1');

  assert.match(code, /^\d{8}$/);
  assert.equal(service.publicState(transaction.securityCodes.pickup).attemptsRemaining, 5);
  assert.deepEqual(service.verify(transaction, 'pickup', code), { ok: true });

  currentTime += 31 * 24 * 60 * 60 * 1000;
  assert.equal(service.verify(transaction, 'pickup', code).status, 400);
});

test('codes operation: cinq erreurs verrouillent le code sans exposer son hash', () => {
  const service = createOperationCodeService({ secret: 'test-secret', now: () => 2_000 });
  const transaction = { id: 'tx-2' };
  service.issue(transaction, 'delivery', 'u-2');

  let result;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    result = service.verify(transaction, 'delivery', '00000000');
  }

  assert.equal(result.status, 429);
  assert.equal(service.publicState(transaction.securityCodes.delivery).locked, true);
  assert.equal(service.publicState(transaction.securityCodes.delivery).attemptsRemaining, 0);
});
