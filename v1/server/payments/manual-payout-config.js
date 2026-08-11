const DEFAULT_COUNTRIES = ['MA', 'BE', 'FR'];

export function manualPayoutConfiguration(env = process.env) {
  const encryptionKey = String(env.MANUAL_PAYOUT_ENCRYPTION_KEY || '').trim();
  const allowedCountries = new Set(
    String(env.MANUAL_PAYOUT_COUNTRIES || DEFAULT_COUNTRIES.join(','))
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
