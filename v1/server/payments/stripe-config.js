import Stripe from 'stripe';

const DEFAULT_CONNECTED_COUNTRIES = [
  'AT', 'BE', 'BG', 'CA', 'CH', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI',
  'FR', 'GB', 'GR', 'HR', 'HU', 'IE', 'IS', 'IT', 'LI', 'LT', 'LU', 'LV',
  'MT', 'NL', 'NO', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK', 'US',
];

export function stripePaymentsEnabled(env = process.env) {
  return String(env.PAYMENT_PROVIDER || '').trim().toLowerCase() === 'stripe';
}

export function stripeConfiguration(env = process.env) {
  const secretKey = String(env.STRIPE_SECRET_KEY || '').trim();
  const publishableKey = String(env.STRIPE_PUBLISHABLE_KEY || '').trim();
  const webhookSecret = String(env.STRIPE_WEBHOOK_SECRET || '').trim();
  const appUrl = String(env.APP_URL || env.APP_ORIGIN || 'http://localhost:5173')
    .trim()
    .replace(/\/$/, '');
  const allowedConnectedCountries = new Set(
    String(env.STRIPE_CONNECTED_COUNTRIES || DEFAULT_CONNECTED_COUNTRIES.join(','))
      .split(',')
      .map((country) => country.trim().toUpperCase())
      .filter(Boolean),
  );
  return {
    enabled: stripePaymentsEnabled(env),
    secretKey,
    publishableKey,
    webhookSecret,
    appUrl,
    allowedConnectedCountries,
    ready: !!(secretKey && publishableKey && webhookSecret),
  };
}

export function createStripeClient(config = stripeConfiguration()) {
  if (!config.secretKey) return null;
  return new Stripe(config.secretKey, {
    appInfo: {
      name: 'Wigolink',
      version: '1.0.0',
      url: 'https://wigolink.com',
    },
    maxNetworkRetries: 2,
    timeout: 20_000,
  });
}
