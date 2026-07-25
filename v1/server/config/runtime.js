export function loadRuntimeConfig(env = process.env) {
  const isProduction = env.NODE_ENV === 'production';
  const appOrigins = String(env.APP_ORIGIN || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const supabaseUrl = String(env.SUPABASE_URL || '').replace(/\/$/, '');
  const supabaseRealtimeOrigin = supabaseUrl
    ? supabaseUrl.replace(/^http/, 'ws')
    : '';

  if (isProduction && env.DEMO === 'true') {
    throw new Error('DEMO ne doit jamais etre active en production.');
  }
  if (isProduction && env.TEST_EMAIL_BYPASS) {
    throw new Error('TEST_EMAIL_BYPASS ne doit jamais etre active en production.');
  }

  return {
    isProduction,
    appOrigins,
    supabaseUrl,
    supabaseRealtimeOrigin,
  };
}
