import { createRepositories } from './repositories.js';
import {
  createPostgresAuditLogRepository,
  createPostgresMessageRepository,
  createPostgresNotificationRepository,
  createPostgresPool,
} from './postgres-repositories.js';

const VALID_DRIVERS = new Set(['json', 'postgres']);
const PARTIAL_POSTGRES_COLLECTIONS = new Set(['auditLogs', 'messages', 'notifications']);

export function persistenceConfig(env = process.env) {
  const requested = String(env.PERSISTENCE_DRIVER || '').trim().toLowerCase();
  const driver = requested || 'json';
  if (!VALID_DRIVERS.has(driver)) {
    throw new Error(`PERSISTENCE_DRIVER invalide: ${driver}. Valeurs supportees: json, postgres.`);
  }
  return {
    driver,
    hasDatabaseUrl: !!env.DATABASE_URL,
    partialPostgresCollections: parseCollections(env.PERSISTENCE_POSTGRES_COLLECTIONS),
    allowPartialPostgres: env.PERSISTENCE_ALLOW_PARTIAL === 'true',
    ready: driver === 'json',
  };
}

export function createPersistence({ db, save, newId, findUser, publicUser, env = process.env, pool = null }) {
  const config = persistenceConfig(env);
  const repositories = createRepositories({ db, save, newId, findUser, publicUser });

  if (config.driver === 'postgres') {
    if (!config.hasDatabaseUrl && !pool) {
      throw new Error('PERSISTENCE_DRIVER=postgres demande DATABASE_URL.');
    }
    const unsupported = config.partialPostgresCollections.filter((name) => !PARTIAL_POSTGRES_COLLECTIONS.has(name));
    if (unsupported.length) {
      throw new Error(`Collections Postgres non supportees pour l'instant: ${unsupported.join(', ')}.`);
    }
    if (!config.allowPartialPostgres || !config.partialPostgresCollections.length) {
      throw new Error('Le stockage Supabase complet est assure par server/store.js. Utilisez PERSISTENCE_DRIVER=json.');
    }

    const postgresPool = pool || createPostgresPool({ connectionString: env.DATABASE_URL });
    if (config.partialPostgresCollections.includes('auditLogs')) {
      repositories.auditLogs = createPostgresAuditLogRepository({ pool: postgresPool, findUser, publicUser });
    }
    if (config.partialPostgresCollections.includes('notifications')) {
      repositories.notifications = createPostgresNotificationRepository({ pool: postgresPool });
    }
    if (config.partialPostgresCollections.includes('messages')) {
      repositories.messages = createPostgresMessageRepository({ pool: postgresPool });
    }
  }

  return {
    config,
    repositories,
  };
}

function parseCollections(value = '') {
  return String(value || '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
}
