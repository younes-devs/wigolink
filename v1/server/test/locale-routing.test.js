import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  localeFromAcceptLanguage,
  localeFromLanguagePreferences,
  localeFromPath,
  localizePath,
  readLocaleCookie,
  resolveRequestLocale,
  stripLocalePrefix,
} from '../../shared/locale-routing.js';

test('locale routing expose une liste stable et le francais par defaut', () => {
  assert.deepEqual(SUPPORTED_LOCALES, ['fr', 'ar', 'nl', 'en', 'es']);
  assert.equal(DEFAULT_LOCALE, 'fr');
});

test('locale routing lit et remplace le prefixe sans perdre query ni hash', () => {
  assert.equal(localeFromPath('/AR/trajets'), 'ar');
  assert.equal(localeFromPath('/de/trajets'), null);
  assert.equal(stripLocalePrefix('/fr/trajets?ville=Oujda#resultats'), '/trajets?ville=Oujda#resultats');
  assert.equal(localizePath('/fr/trajets?ville=Oujda#resultats', 'es'), '/es/trajets?ville=Oujda#resultats');
  assert.equal(localizePath('/trajets?ville=Oujda#resultats', 'nl-BE'), '/nl/trajets?ville=Oujda#resultats');
  assert.equal(localizePath('/', 'ar'), '/ar');
});

test('locale routing respecte les preferences navigateur et les poids HTTP', () => {
  assert.equal(localeFromLanguagePreferences(['de-DE', 'es-MX', 'fr-FR']), 'es');
  assert.equal(localeFromAcceptLanguage('de-DE, en-GB;q=0.7, fr-FR;q=0.9'), 'fr');
  assert.equal(localeFromAcceptLanguage('es;q=0, nl-BE;q=0.6, en;q=0.4'), 'nl');
  assert.equal(localeFromAcceptLanguage('de-DE, *;q=0.5'), null);
});

test('locale routing donne priorite au cookie puis au navigateur puis au francais', () => {
  assert.equal(readLocaleCookie('session=x; wigolink_lang=ar; theme=dark'), 'ar');
  assert.equal(resolveRequestLocale({ cookieHeader: 'wigolink_lang=es', acceptLanguage: 'ar' }), 'es');
  assert.equal(resolveRequestLocale({ cookieHeader: 'wigolink_lang=de', acceptLanguage: 'en-US' }), 'en');
  assert.equal(resolveRequestLocale({ acceptLanguage: 'de-DE' }), 'fr');
});
