import assert from 'node:assert/strict';
import test from 'node:test';

const manifest = {
  href: '',
  setAttribute(name, value) {
    if (name === 'href') this.href = value;
  },
};
const stored = new Map();
globalThis.document = {
  documentElement: { lang: 'fr', dir: 'ltr' },
  title: '',
  querySelector(selector) {
    return selector === 'link[rel="manifest"]' ? manifest : null;
  },
};
globalThis.localStorage = {
  getItem: (key) => stored.get(key) || null,
  setItem: (key, value) => stored.set(key, value),
  removeItem: (key) => stored.delete(key),
};

const i18n = await import('../../client/src/i18n.js');

test('client i18n charge anglais et espagnol avec locale et manifeste', async () => {
  assert.deepEqual(i18n.LANGS.map(({ code }) => code), ['fr', 'ar', 'nl', 'en', 'es']);

  assert.equal(await i18n.setLang('en'), true);
  assert.equal(i18n.t('settings.title'), 'Settings');
  assert.equal(i18n.t('auth.sub.verify', { email: 'test@example.com' }), 'A 6-digit code was sent to test@example.com.');
  assert.equal(i18n.dateLocale(), 'en-GB');
  assert.equal(document.documentElement.lang, 'en');
  assert.equal(document.documentElement.dir, 'ltr');
  assert.equal(manifest.href, '/manifest.en.webmanifest');

  assert.equal(await i18n.setLang('es'), true);
  assert.equal(i18n.t('settings.title'), 'Configuración');
  assert.equal(i18n.dateLocale(), 'es-ES');
  assert.equal(document.documentElement.lang, 'es');
  assert.equal(document.documentElement.dir, 'ltr');
  assert.equal(manifest.href, '/manifest.es.webmanifest');
});

test('client i18n refuse une langue inconnue', async () => {
  assert.equal(await i18n.setLang('de'), false);
  assert.equal(document.documentElement.lang, 'es');
});
