// Socle i18n (PRD UI/UX U14). Mécanisme minimal, sans dépendance : un dictionnaire par
// langue (src/locales/) et une fonction t(). L'arabe d'abord (diaspora marocaine), RTL
// géré via dir="rtl" posé avant le rendu (script inline d'index.html).
// Les messages d'erreur de l'API et les libellés de catégories sont traduits côté
// SERVEUR (server/errors.js, rules.js) via l'en-tête Accept-Language envoyé par api.js.
// Seule exception : les catégories promues dynamiquement (customWhitelist) restent dans
// la langue de leur création.
import { useSyncExternalStore } from 'react';
import fr from './locales/fr.js';
import {
  LOCALE_COOKIE,
  SUPPORTED_LOCALES,
  localeFromPath,
  localizePath,
} from '../../shared/locale-routing.js';

const DICT = { fr };
const LOCALE_LOADERS = {
  ar: () => import('./locales/ar.js'),
  nl: () => import('./locales/nl.js'),
  en: () => import('./locales/en.js'),
  es: () => import('./locales/es.js'),
};
const ADMIN_LOADERS = {
  fr: () => import('./locales/admin.fr.js'),
  ar: () => import('./locales/admin.ar.js'),
  nl: () => import('./locales/admin.nl.js'),
  en: () => import('./locales/admin.en.js'),
  es: () => import('./locales/admin.es.js'),
};
const RTL_LANGS = new Set(['ar']);
const KEY = LOCALE_COOKIE;

export const LANGS = [
  { code: 'fr', label: 'Français' },
  { code: 'ar', label: 'العربية' },
  { code: 'nl', label: 'Nederlands' },
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
];

const SUPPORTED_LANGS = SUPPORTED_LOCALES;

let current = SUPPORTED_LANGS.includes(document.documentElement.lang)
  ? document.documentElement.lang
  : 'fr';
let adminTranslationsRequested = false;
const listeners = new Set();

function syncDocumentLanguage() {
  document.documentElement.lang = current;
  document.documentElement.dir = RTL_LANGS.has(current) ? 'rtl' : 'ltr';
  document.title = DICT[current]?.['app.title'] || DICT.fr['app.title'];
  document.querySelector('link[rel="manifest"]')?.setAttribute('href', `/manifest.${current}.webmanifest`);
}

function persistLanguage(lang) {
  localStorage.setItem(KEY, lang);
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${LOCALE_COOKIE}=${encodeURIComponent(lang)}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
}

async function loadLanguage(lang) {
  if (!DICT[lang]) {
    const module = await LOCALE_LOADERS[lang]?.();
    if (module?.default) DICT[lang] = module.default;
  }
  return DICT[lang];
}

async function loadAdminLanguage(lang) {
  await loadLanguage(lang);
  const module = await ADMIN_LOADERS[lang]?.();
  if (module?.default) Object.assign(DICT[lang], module.default);
}

export async function initializeI18n() {
  const pathLanguage = localeFromPath(window.location.pathname);
  if (pathLanguage) current = pathLanguage;
  await loadLanguage(current);
  persistLanguage(current);
  syncDocumentLanguage();
}

export async function loadAdminTranslations() {
  adminTranslationsRequested = true;
  await Promise.all([
    loadAdminLanguage('fr'),
    current === 'fr' ? Promise.resolve() : loadAdminLanguage(current),
  ]);
  listeners.forEach((listener) => listener());
}

export function getLang() { return current; }

// Locale Intl pour dates/nombres, alignée sur la langue de l'UI.
const DATE_LOCALES = { fr: 'fr-BE', ar: 'ar-MA', nl: 'nl-BE', en: 'en-GB', es: 'es-ES' };
export function dateLocale() { return DATE_LOCALES[current] || 'fr-BE'; }

export async function setLang(lang) {
  if (!SUPPORTED_LANGS.includes(lang)) return false;
  await loadLanguage(lang);
  if (adminTranslationsRequested) await loadAdminLanguage(lang);
  current = lang;
  persistLanguage(lang);
  syncDocumentLanguage();
  listeners.forEach((l) => l());
  return true;
}

export function languageUrl(lang, location = window.location) {
  return localizePath(`${location.pathname}${location.search}${location.hash}`, lang);
}

export function t(key, vars) {
  let s = (DICT[current] && DICT[current][key]) || DICT.fr[key] || key;
  if (vars) for (const [k, v] of Object.entries(vars)) {
    s = s.replaceAll(`{{${k}}}`, v).replaceAll(`{${k}}`, v);
  }
  return s;
}

// Hook React : re-rend les composants qui utilisent t() quand la langue change.
export function useLang() {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    () => current,
  );
}
