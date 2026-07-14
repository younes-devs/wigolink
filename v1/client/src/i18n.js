// Socle i18n (PRD UI/UX U14). Mécanisme minimal, sans dépendance : un dictionnaire par
// langue (src/locales/) et une fonction t(). L'arabe d'abord (diaspora marocaine), RTL
// géré via dir="rtl" posé avant le rendu (script inline d'index.html).
// Les messages d'erreur de l'API sont traduits côté SERVEUR (voir server/errors.js) via
// l'en-tête Accept-Language envoyé par api.js. Limite restante documentée : les libellés
// de catégories de la liste blanche (rules.js) restent en français.
import { useSyncExternalStore } from 'react';
import fr from './locales/fr.js';
import ar from './locales/ar.js';
import nl from './locales/nl.js';

const DICT = { fr, ar, nl };
const RTL_LANGS = new Set(['ar']);
const KEY = 'wigofly_lang';

export const LANGS = [
  { code: 'fr', label: 'Français' },
  { code: 'ar', label: 'العربية' },
  { code: 'nl', label: 'Nederlands' },
];

let current = DICT[document.documentElement.lang] ? document.documentElement.lang : 'fr';
const listeners = new Set();

export function getLang() { return current; }

// Locale Intl pour dates/nombres, alignée sur la langue de l'UI.
const DATE_LOCALES = { fr: 'fr-BE', ar: 'ar-MA', nl: 'nl-BE' };
export function dateLocale() { return DATE_LOCALES[current] || 'fr-BE'; }

export function setLang(lang) {
  if (!DICT[lang]) return;
  current = lang;
  localStorage.setItem(KEY, lang);
  document.documentElement.lang = lang;
  document.documentElement.dir = RTL_LANGS.has(lang) ? 'rtl' : 'ltr';
  listeners.forEach((l) => l());
}

export function t(key, vars) {
  let s = (DICT[current] && DICT[current][key]) || DICT.fr[key] || key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, v);
  return s;
}

// Hook React : re-rend les composants qui utilisent t() quand la langue change.
export function useLang() {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    () => current,
  );
}
