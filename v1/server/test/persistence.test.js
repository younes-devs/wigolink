import test from 'node:test';
import assert from 'node:assert/strict';
import { persistenceConfig, createPersistence } from '../persistence.js';

test('persistence : JSON par defaut sans DATABASE_URL', () => {
  const config = persistenceConfig({});
  assert.equal(config.driver, 'json');
  assert.equal(config.ready, true);
  assert.equal(config.hasDatabaseUrl, false);
});

test('persistence : DATABASE_URL conserve le mode JSON jusqu a la migration explicite', () => {
  const config = persistenceConfig({ DATABASE_URL: 'postgresql://example' });
  assert.equal(config.driver, 'json');
  assert.equal(config.ready, true);
  assert.equal(config.hasDatabaseUrl, true);
  assert.deepEqual(config.partialPostgresCollections, []);
});

test('persistence : postgres partiel autorise auditLogs, notifications et messages explicitement', () => {
  const queries = [];
  const pool = { query(sql, params) { queries.push({ sql, params }); return { rows: [] }; } };
  const { repositories, config } = createPersistence({
    db: {},
    save() {},
    newId(prefix) { return `${prefix}-1`; },
    findUser() { return null; },
    publicUser() { return null; },
    pool,
    env: {
      DATABASE_URL: 'postgresql://example',
      PERSISTENCE_DRIVER: 'postgres',
      PERSISTENCE_ALLOW_PARTIAL: 'true',
      PERSISTENCE_POSTGRES_COLLECTIONS: 'auditLogs,notifications,messages',
    },
  });

  assert.deepEqual(config.partialPostgresCollections, ['auditLogs', 'notifications', 'messages']);
  assert.equal(typeof repositories.auditLogs.append, 'function');
  assert.equal(typeof repositories.notifications.append, 'function');
  assert.equal(typeof repositories.messages.append, 'function');
  assert.equal(typeof repositories.kyc.appendSubmission, 'function', 'les autres repositories restent en JSON');
});

test('persistence : postgres partiel refuse les collections non supportees', () => {
  assert.throws(
    () => createPersistence({
      db: {},
      save() {},
      newId(prefix) { return `${prefix}-1`; },
      findUser() { return null; },
      publicUser() { return null; },
      pool: { query() { return { rows: [] }; } },
      env: {
        DATABASE_URL: 'postgresql://example',
        PERSISTENCE_DRIVER: 'postgres',
        PERSISTENCE_ALLOW_PARTIAL: 'true',
        PERSISTENCE_POSTGRES_COLLECTIONS: 'transactions',
      },
    }),
    /Collections Postgres non supportees/
  );
});

test('persistence : PERSISTENCE_DRIVER invalide refuse le demarrage', () => {
  assert.throws(
    () => persistenceConfig({ PERSISTENCE_DRIVER: 'sqlite' }),
    /PERSISTENCE_DRIVER invalide/
  );
});
