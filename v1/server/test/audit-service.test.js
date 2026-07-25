import assert from 'node:assert/strict';
import test from 'node:test';
import {
  auditChanges,
  auditValue,
  createAuditService,
} from '../services/audit.js';

test('audit service normalise uniquement les valeurs scalaires autorisees', () => {
  assert.equal(auditValue(undefined), null);
  assert.equal(auditValue(null), null);
  assert.equal(auditValue(''), null);
  assert.equal(auditValue(true), true);
  assert.equal(auditValue(42), 42);
  assert.equal(auditValue({ secret: true }), null);
  assert.equal(auditValue(['photo']), null);
  assert.equal(auditValue('x'.repeat(1_100)).length, 1_000);
});

test('audit service conserve uniquement les champs effectivement modifies', () => {
  assert.deepEqual(
    auditChanges(
      { name: 'Avant', city: 'Bruxelles', photo: { data: 'binary' } },
      { name: 'Apres', city: 'Bruxelles', photo: { data: 'different' } },
      ['name', 'city', 'photo'],
    ),
    [{ field: 'name', before: 'Avant', after: 'Apres' }],
  );
});

test('audit service transmet un evenement brut au repository', async () => {
  const appended = [];
  const service = createAuditService({
    auditLogs: {
      async append(entry) {
        appended.push(entry);
        return { id: 'audit-1', ...entry };
      },
    },
  });

  const result = await service.audit(
    'u-admin',
    'user.view',
    'user',
    'u-1',
    { section: 'overview' },
  );

  assert.deepEqual(appended, [{
    actorId: 'u-admin',
    action: 'user.view',
    targetType: 'user',
    targetId: 'u-1',
    meta: { section: 'overview' },
  }]);
  assert.equal(result.id, 'audit-1');
});

test('audit service n ecrit rien sans changement', async () => {
  let appendCalls = 0;
  const service = createAuditService({
    auditLogs: {
      async append() {
        appendCalls += 1;
      },
    },
  });

  const result = await service.auditChange({
    actorId: 'u-1',
    action: 'profile.update',
    targetType: 'user',
    targetId: 'u-1',
    subjectUserId: 'u-1',
    before: { name: 'Membre' },
    after: { name: 'Membre' },
    fields: ['name'],
  });

  assert.equal(result, null);
  assert.equal(appendCalls, 0);
});

test('audit service ecrit recordEmpty et impose le sujet et les changements calcules', async () => {
  let appended;
  const service = createAuditService({
    auditLogs: {
      async append(entry) {
        appended = entry;
        return entry;
      },
    },
  });

  await service.auditChange({
    actorId: 'u-1',
    action: 'profile.password.update',
    targetType: 'user',
    targetId: 'u-1',
    subjectUserId: 'u-1',
    before: {},
    after: {},
    fields: [],
    meta: {
      recordEmpty: true,
      subjectUserId: 'forged',
      changes: ['forged'],
    },
  });

  assert.deepEqual(appended, {
    actorId: 'u-1',
    action: 'profile.password.update',
    targetType: 'user',
    targetId: 'u-1',
    meta: {
      recordEmpty: true,
      subjectUserId: 'u-1',
      changes: [],
    },
  });
});
