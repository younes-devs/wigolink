import Stripe from 'stripe';

export function stripePaymentsEnabled(env = process.env) {
  return String(env.PAYMENT_PROVIDER || '').trim().toLowerCase() === 'stripe';
}

export function stripeConfiguration(env = process.env) {
  const secretKey = String(env.STRIPE_SECRET_KEY || '').trim();
  const webhookSecret = String(env.STRIPE_WEBHOOK_SECRET || '').trim();
  const appUrl = String(env.APP_URL || env.APP_ORIGIN || 'http://localhost:5173')
    .trim()
    .replace(/\/$/, '');
  return {
    enabled: stripePaymentsEnabled(env),
    secretKey,
    webhookSecret,
    appUrl,
    ready: !!(secretKey && webhookSecret),
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
