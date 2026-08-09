export const PAYMENT_CURRENCY = 'EUR';
export const FEE_POLICY_VERSION = '2026-08-tiered-v1';

const FEE_TIERS = Object.freeze([
  { minimumCents: 10_000, feeCents: 600 },
  { minimumCents: 5_000, feeCents: 300 },
  { minimumCents: 0, feeCents: 150 },
]);

export function eurosToCents(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) throw new TypeError('Montant invalide.');
  return Math.round(amount * 100);
}

export function centsToEuros(value) {
  const cents = requireIntegerCents(value, 'Montant');
  return cents / 100;
}

export function serviceFeeCentsFor(travelerPriceCents) {
  const priceCents = requireIntegerCents(travelerPriceCents, 'Prix voyageur');
  if (priceCents <= 0) throw new RangeError('Le prix voyageur doit etre positif.');
  return FEE_TIERS.find((tier) => priceCents >= tier.minimumCents).feeCents;
}

export function quotePayment({ travelerPrice, travelerPriceCents, currency = PAYMENT_CURRENCY }) {
  const normalizedCurrency = String(currency || '').trim().toUpperCase();
  if (normalizedCurrency !== PAYMENT_CURRENCY) {
    throw new RangeError(`Devise non prise en charge: ${normalizedCurrency || 'inconnue'}.`);
  }
  const priceCents = travelerPriceCents === undefined
    ? eurosToCents(travelerPrice)
    : requireIntegerCents(travelerPriceCents, 'Prix voyageur');
  const feeCents = serviceFeeCentsFor(priceCents);
  if (priceCents <= feeCents) {
    throw new RangeError('Le prix voyageur doit etre superieur aux frais de service.');
  }
  return Object.freeze({
    currency: PAYMENT_CURRENCY,
    travelerPriceCents: priceCents,
    senderFeeCents: feeCents,
    travelerFeeCents: feeCents,
    chargedAmountCents: priceCents + feeCents,
    travelerTransferCents: priceCents - feeCents,
    platformGrossCents: feeCents * 2,
    feePolicyVersion: FEE_POLICY_VERSION,
  });
}

export function paymentSnapshot(quote) {
  return {
    currency: quote.currency,
    priceCents: quote.travelerPriceCents,
    senderFeeCents: quote.senderFeeCents,
    travelerFeeCents: quote.travelerFeeCents,
    chargedAmountCents: quote.chargedAmountCents,
    travelerTransferCents: quote.travelerTransferCents,
    platformGrossCents: quote.platformGrossCents,
    feePolicyVersion: quote.feePolicyVersion,
  };
}

function requireIntegerCents(value, label) {
  const cents = Number(value);
  if (!Number.isSafeInteger(cents)) throw new TypeError(`${label} invalide.`);
  return cents;
}
