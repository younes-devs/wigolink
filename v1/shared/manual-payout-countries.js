export const MANUAL_PAYOUT_COUNTRIES = Object.freeze(['MA', 'FR', 'BE', 'ES', 'NL']);

export function emptyManualPayoutCounts() {
  return Object.fromEntries(MANUAL_PAYOUT_COUNTRIES.map((country) => [country, 0]));
}

export function isManualPayoutCountry(country) {
  return MANUAL_PAYOUT_COUNTRIES.includes(String(country || '').trim().toUpperCase());
}
