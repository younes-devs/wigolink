import assert from 'node:assert/strict';
import test from 'node:test';
import { loadRuntimeConfig } from '../config/runtime.js';

test('runtime config fournit des valeurs locales sûres par défaut', () => {
  assert.deepEqual(loadRuntimeConfig({}), {
    isProduction: false,
    appOrigins: [],
    supabaseUrl: '',
    supabaseRealtimeOrigin: '',
  });
});

test('runtime config normalise les origines CORS et Supabase', () => {
  assert.deepEqual(loadRuntimeConfig({
    NODE_ENV: 'production',
    APP_ORIGIN: ' https://wigofly.app,https://admin.wigofly.app, ',
    SUPABASE_URL: 'https://project.supabase.co/',
  }), {
    isProduction: true,
    appOrigins: ['https://wigofly.app', 'https://admin.wigofly.app'],
    supabaseUrl: 'https://project.supabase.co',
    supabaseRealtimeOrigin: 'wss://project.supabase.co',
  });
});

test('runtime config refuse DEMO en production', () => {
  assert.throws(
    () => loadRuntimeConfig({ NODE_ENV: 'production', DEMO: 'true' }),
    /DEMO ne doit jamais etre active en production/,
  );
});

test('runtime config refuse tout bypass email défini en production', () => {
  assert.throws(
    () => loadRuntimeConfig({ NODE_ENV: 'production', TEST_EMAIL_BYPASS: 'false' }),
    /TEST_EMAIL_BYPASS ne doit jamais etre active en production/,
  );
});

test('runtime config autorise les drapeaux de test hors production', () => {
  const config = loadRuntimeConfig({
    NODE_ENV: 'development',
    DEMO: 'true',
    TEST_EMAIL_BYPASS: '1',
  });

  assert.equal(config.isProduction, false);
});
