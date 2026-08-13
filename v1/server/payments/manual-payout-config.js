import { MANUAL_PAYOUT_COUNTRIES } from '../../shared/manual-payout-countries.js';

export function manualPayoutConfiguration(env = process.env) {
  const encryptionKey = String(env.MANUAL_PAYOUT_ENCRYPTION_KEY || '').trim();
  const allowedCountries = new Set(
    String(env.MANUAL_PAYOUT_COUNTRIES || MANUAL_PAYOUT_COUNTRIES.join(','))
      .split(',')
      .map((country) => country.trim().toUpperCase())
      .filter(Boolean),
  );
  return {
    mode: 'manual',
    enabled: true,
    encryptionKey,
    allowedCountries,
  };
}
