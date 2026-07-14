// Socle i18n (PRD UI/UX U14). Mécanisme minimal, sans dépendance : un dictionnaire par
// langue (src/locales/) et une fonction t(). L'arabe d'abord (diaspora marocaine), RTL
// géré via dir="rtl" posé avant le rendu (script inline d'index.html).
// Limite documentée : les textes générés par le SERVEUR (messages d'erreur API, libellés
// de catégories de la liste blanche) restent en français — les traduire relève d'un
// chantier serveur séparé (Accept-Language), pas de l'UI.
import { useSyncExternalStore } from 'react';
import fr from './locales/fr.js';
import ar from './locales/ar.js';

const DICT = { fr, ar };
const RTL_LANGS = new Set(['ar']);
const KEY = 'wigofly_lang';

export const LANGS = [
  { code: 'fr', label: 'Français' },
  { code: 'ar', label: 'العربية' },
];

let current = document.documentElement.lang === 'ar' ? 'ar' : 'fr';
const listeners = new Set();

export function getLang() { return current; }

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
