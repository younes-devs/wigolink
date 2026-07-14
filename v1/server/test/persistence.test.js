import test from 'node:test';
import assert from 'node:assert/strict';
import { persistenceConfig, createPersistence } from '../persistence.js';

test('persistence : JSON par defaut sans DATABASE_URL', () => {
  const config = persistenceConfig({});
  assert.equal(config.driver, 'json');
  assert.equal(config.ready, true);
  assert.equal(config.hasDatabaseUrl, false);
});

test('persistence : DATABASE_URL selectionne postgres mais bloque l activation incomplete', () => {
  const config = persistenceConfig({ DATABASE_URL: 'postgresql://example' });
  assert.equal(config.driver, 'postgres');
  assert.equal(config.ready, false);
  assert.equal(config.hasDatabaseUrl, true);

  assert.throws(
    () => createPersistence({
      db: {},
      save() {},
      newId(prefix) { return `${prefix}-1`; },
      findUser() { return null; },
      publicUser() { return null; },
      env: { DATABASE_URL: 'postgresql://example' },
    }),
    /adaptateur Postgres complet/
  );
});

test('persistence : PERSISTENCE_DRIVER invalide refuse le demarrage', () => {
  assert.throws(
    () => persistenceConfig({ PERSISTENCE_DRIVER: 'sqlite' }),
    /PERSISTENCE_DRIVER invalide/
  );
});
