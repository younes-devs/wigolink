import test from 'node:test';
import assert from 'node:assert/strict';
import {
  centsToEuros,
  eurosToCents,
  quotePayment,
  serviceFeeCentsFor,
} from '../payments/pricing.js';

test('tarification Stripe: limites exactes des trois tranches', () => {
  assert.equal(serviceFeeCentsFor(4_999), 150);
  assert.equal(serviceFeeCentsFor(5_000), 300);
  assert.equal(serviceFeeCentsFor(9_999), 300);
  assert.equal(serviceFeeCentsFor(10_000), 600);
});

test('tarification Stripe: exemple a 10 EUR', () => {
  assert.deepEqual(quotePayment({ travelerPrice: 10 }), {
    currency: 'EUR',
    travelerPriceCents: 1_000,
    senderFeeCents: 150,
    travelerFeeCents: 150,
    chargedAmountCents: 1_150,
    travelerTransferCents: 850,
    platformGrossCents: 300,
    feePolicyVersion: '2026-08-tiered-v1',
  });
});

test('tarification Stripe: exemples a 50 et 100 EUR', () => {
  const fifty = quotePayment({ travelerPriceCents: 5_000 });
  assert.equal(fifty.chargedAmountCents, 5_300);
  assert.equal(fifty.travelerTransferCents, 4_700);
  assert.equal(fifty.platformGrossCents, 600);

  const hundred = quotePayment({ travelerPriceCents: 10_000 });
  assert.equal(hundred.chargedAmountCents, 10_600);
  assert.equal(hundred.travelerTransferCents, 9_400);
  assert.equal(hundred.platformGrossCents, 1_200);
});

test('tarification Stripe: conversion monetaire sans flottants persistants', () => {
  assert.equal(eurosToCents(11.5), 1_150);
  assert.equal(eurosToCents('49.99'), 4_999);
  assert.equal(centsToEuros(4_999), 49.99);
});

test('tarification Stripe: refuse les devises et prix incompatibles', () => {
  assert.throws(() => quotePayment({ travelerPrice: 10, currency: 'USD' }), /Devise/);
  assert.throws(() => quotePayment({ travelerPriceCents: 150 }), /superieur/);
  assert.throws(() => serviceFeeCentsFor(0), /positif/);
});
