import assert from 'node:assert/strict';
import test from 'node:test';
import { fixtureConfig } from '../../scripts/scalability-fixture.mjs';

const validEnv = {
  SCALABILITY_FIXTURE_CONFIRM: 'STAGING_ONLY',
  SCALABILITY_DATABASE_URL: 'postgres://staging.example.test/wigofly',
  NODE_ENV: 'test',
};

test('jeu de charge exige une base dediee et une confirmation explicite', () => {
  assert.throws(
    () => fixtureConfig({ env: {}, argv: [] }),
    /SCALABILITY_FIXTURE_CONFIRM=STAGING_ONLY/,
  );
  assert.throws(
    () => fixtureConfig({
      env: { SCALABILITY_FIXTURE_CONFIRM: 'STAGING_ONLY' },
      argv: [],
    }),
    /SCALABILITY_DATABASE_URL/,
  );
});

test('jeu de charge refuse toujours un environnement de production', () => {
  assert.throws(
    () => fixtureConfig({
      env: { ...validEnv, VERCEL_ENV: 'production' },
      argv: [],
    }),
    /interdit en production/,
  );
});

test('jeu de charge expose des profils bornes et un nettoyage cible', () => {
  const config = fixtureConfig({
    env: validEnv,
    argv: [
      '--profile=medium',
      '--run-id=release-20260729',
      '--cleanup',
    ],
  });

  assert.equal(config.profileName, 'medium');
  assert.equal(config.profile.users, 10_000);
  assert.equal(config.profile.messages, 500_000);
  assert.equal(config.runId, 'release-20260729');
  assert.equal(config.cleanup, true);
});
