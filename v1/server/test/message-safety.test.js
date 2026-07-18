import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeMessageSafety, normalizeSafetyText } from '../rules.js';

test('message safety catches phone, email, URL and social handles', () => {
  for (const text of ['Mon numero est 06 12 34 56 78', 'ecris a nom@example.com', 'https://example.com', '@contact_prive']) {
    assert.equal(analyzeMessageSafety(text).blocked, true, text);
  }
});

test('message safety catches off-platform contact in launch languages', () => {
  for (const text of [
    'Appelle moi sur WhatsApp',
    'Call me on Telegram',
    'Escribeme por Instagram',
    'Schreib mir auf Signal',
    'Stuur mij een bericht buiten de app',
    'راسلني على واتساب',
  ]) assert.equal(analyzeMessageSafety(text).blocked, true, text);
});

test('message safety catches external payments and Arabic digits', () => {
  for (const text of ['Je paie par PayPal', 'Pago por transferencia bancaria', 'Uberweisung ausserhalb der app', 'أرسل تحويل بنكي', '٠٦ ١٢ ٣٤ ٥٦ ٧٨']) {
    assert.equal(analyzeMessageSafety(text).blocked, true, text);
  }
});

test('message safety preserves ordinary coordination messages', () => {
  for (const text of ['Bonjour, ou se fait la remise ?', 'Le colis pese 3 kg et le prix est 15 EUR.', 'Je confirme le rendez-vous demain.']) {
    assert.equal(analyzeMessageSafety(text).blocked, false, text);
  }
  assert.equal(normalizeSafetyText('Été ٠٦'), 'ete 06');
});
