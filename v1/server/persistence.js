import { createRepositories } from './repositories.js';

const VALID_DRIVERS = new Set(['json', 'postgres']);

export function persistenceConfig(env = process.env) {
  const requested = String(env.PERSISTENCE_DRIVER || '').trim().toLowerCase();
  const driver = requested || (env.DATABASE_URL ? 'postgres' : 'json');
  if (!VALID_DRIVERS.has(driver)) {
    throw new Error(`PERSISTENCE_DRIVER invalide: ${driver}. Valeurs supportees: json, postgres.`);
  }
  return {
    driver,
    hasDatabaseUrl: !!env.DATABASE_URL,
    ready: driver === 'json',
  };
}

export function createPersistence({ db, save, newId, findUser, publicUser, env = process.env }) {
  const config = persistenceConfig(env);
  if (config.driver === 'postgres') {
    throw new Error(
      'PERSISTENCE_DRIVER=postgres demande un adaptateur Postgres complet. ' +
      'Les repositories JSON sont isoles, mais transactions/listings/auth restent a migrer avant activation.'
    );
  }

  return {
    config,
    repositories: createRepositories({ db, save, newId, findUser, publicUser }),
  };
}
