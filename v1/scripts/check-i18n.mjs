import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ERRORS, PATTERNS } from '../server/middleware/language.js';
import { TEMPLATES } from '../server/notify-i18n.js';
import { BLACKLIST, CUSTOMS, WHITELIST } from '../server/rules.js';
import baseFr from '../client/src/locales/fr.js';
import baseNl from '../client/src/locales/nl.js';
import baseAr from '../client/src/locales/ar.js';
import baseEn from '../client/src/locales/en.js';
import baseEs from '../client/src/locales/es.js';
import adminFr from '../client/src/locales/admin.fr.js';
import adminNl from '../client/src/locales/admin.nl.js';
import adminAr from '../client/src/locales/admin.ar.js';
import adminEn from '../client/src/locales/admin.en.js';
import adminEs from '../client/src/locales/admin.es.js';
import { SUPPORTED_LOCALES } from '../shared/locale-routing.js';

const root = path.resolve(import.meta.dirname, '..');
const fr = { ...baseFr, ...adminFr };
const nl = { ...baseNl, ...adminNl };
const ar = { ...baseAr, ...adminAr };
const en = { ...baseEn, ...adminEn };
const es = { ...baseEs, ...adminEs };
const dictionaries = { fr, nl, ar, en, es };
const dictionaryLanguages = Object.keys(dictionaries).sort();
const supportedLanguages = [...SUPPORTED_LOCALES];
const translatedLanguages = supportedLanguages.filter((lang) => lang !== 'fr');
const failures = [];

if (dictionaryLanguages.join('|') !== [...SUPPORTED_LOCALES].sort().join('|')) {
  failures.push(`Langues du routage incompatibles: ${SUPPORTED_LOCALES.join(', ')}`);
}

const indexHtml = fs.readFileSync(path.join(root, 'client/index.html'), 'utf8');
const inlineLanguages = indexHtml.match(/var languages = \[([^\]]+)\]/)?.[1]
  ?.match(/['"]([a-z]{2})['"]/g)
  ?.map((value) => value.slice(1, -1)) || [];
if (inlineLanguages.join('|') !== SUPPORTED_LOCALES.join('|')) {
  failures.push(`Langues du bootstrap incompatibles: ${inlineLanguages.join(', ')}`);
}

function fail(message) {
  failures.push(message);
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(target) : target;
  });
}

function placeholders(value) {
  return [...String(value).matchAll(/\{([^}]+)\}/g)].map((match) => match[1]).sort();
}

const referenceKeys = Object.keys(fr).sort();
if (!referenceKeys.includes('app.title')) fail('Titre de l application non localisé');
for (const [lang, dict] of Object.entries(dictionaries)) {
  const keys = Object.keys(dict).sort();
  const missing = referenceKeys.filter((key) => !(key in dict));
  const extra = keys.filter((key) => !(key in fr));
  if (missing.length) fail(`${lang}: clés manquantes: ${missing.join(', ')}`);
  if (extra.length) fail(`${lang}: clés supplémentaires: ${extra.join(', ')}`);
  for (const key of referenceKeys) {
    if (typeof fr[key] !== 'string' || typeof dict[key] !== 'string') continue;
    const expected = placeholders(fr[key]).join('|');
    const actual = placeholders(dict[key]).join('|');
    if (expected !== actual) fail(`${lang}: variables incompatibles pour ${key} (${actual} au lieu de ${expected})`);
  }
}

for (const lang of supportedLanguages) {
  const manifestPath = path.join(root, `client/public/manifest.${lang}.webmanifest`);
  if (!fs.existsSync(manifestPath)) {
    fail(`Manifeste PWA ${lang} absent`);
    continue;
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.lang !== lang || !manifest.description) fail(`Manifeste PWA ${lang} incomplet`);
  if (manifest.start_url !== `/${lang}`) fail(`Manifeste PWA ${lang}: start_url doit etre /${lang}`);
  if (lang === 'ar' && manifest.dir !== 'rtl') fail('Manifeste PWA arabe sans direction RTL');
}

globalThis.document = {
  documentElement: { lang: 'fr', dir: 'ltr' },
  querySelector: () => null,
  title: '',
};
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const { LEGAL_COPY } = await import(pathToFileURL(path.join(root, 'client/src/legalCopy.js')).href);
for (const type of ['privacy', 'terms']) {
  const reference = LEGAL_COPY[type].fr;
  for (const lang of translatedLanguages) {
    const copy = LEGAL_COPY[type][lang];
    if (!copy) {
      fail(`${type}: copie ${lang} absente`);
      continue;
    }
    const ids = copy.sections.map((section) => section.id);
    const referenceIds = reference.sections.map((section) => section.id);
    if (ids.join('|') !== referenceIds.join('|')) fail(`${type}: sections ${lang} incompatibles`);
    reference.sections.forEach((section, index) => {
      const translated = copy.sections[index];
      for (const field of ['paragraphs', 'list', 'ordered']) {
        if ((section[field]?.length || 0) !== (translated[field]?.length || 0)) {
          fail(`${type}.${section.id}: ${field} incomplet en ${lang}`);
        }
      }
      if (!!section.table !== !!translated.table) fail(`${type}.${section.id}: tableau manquant en ${lang}`);
      if (section.table && (
        section.table.headers.length !== translated.table.headers.length
        || section.table.rows.length !== translated.table.rows.length
      )) fail(`${type}.${section.id}: tableau incomplet en ${lang}`);
    });
  }
}

const clientFiles = walk(path.join(root, 'client/src'))
  .filter((file) => /\.(js|jsx)$/.test(file))
  .filter((file) => !file.includes(`${path.sep}locales${path.sep}`))
  .filter((file) => !file.endsWith(`${path.sep}legalCopy.js`));

const literalKeys = new Set();
for (const file of clientFiles) {
  const source = fs.readFileSync(file, 'utf8');
  for (const match of source.matchAll(/\bt\(\s*['"]([^'"]+)['"]/g)) literalKeys.add(match[1]);
}
for (const key of literalKeys) {
  for (const [lang, dict] of Object.entries(dictionaries)) {
    if (!(key in dict)) fail(`${lang}: clé utilisée mais absente: ${key}`);
  }
}

// Public screens must not depend on dictionaries loaded only after entering /admin.
const publicClientFiles = clientFiles.filter((file) => !file.includes(`${path.sep}features${path.sep}admin${path.sep}`));
const publicSource = publicClientFiles
  .map((file) => fs.readFileSync(file, 'utf8'))
  .join('\n');
const serverPublicKeys = [...fs.readFileSync(path.join(root, 'server/index.js'), 'utf8')
  .matchAll(/\b(?:actionKey|warningKey)\s*:\s*['"]([^'"]+)['"]/g)]
  .map((match) => match[1]);
const publicKeys = new Set(serverPublicKeys);
for (const match of publicSource.matchAll(/\bt\(\s*['"]([^'"]+)['"]/g)) publicKeys.add(match[1]);
for (const key of publicKeys) {
  for (const [lang, dict] of Object.entries({ fr: baseFr, nl: baseNl, ar: baseAr, en: baseEn, es: baseEs })) {
    if (!(key in dict)) fail(`${lang}: public key available only in the admin module: ${key}`);
  }
}

const allowedVisible = [
  /^Wigolink$/,
  /^Casablanca$/,
  /^Bruxelles$/,
  /^Casablanca\s*(?:→|->)\s*Bruxelles$/,
  /^Bruxelles\s*(?:→|->)\s*Casablanca$/,
  /^(?:kg|Kg|EUR|NPS)$/,
  /^support@wigolink\.com$/,
];
const allowedAttribute = [
  ...allowedVisible,
  /^\+32…$/,
  /^ABC123$/,
  /^\*{8}$/,
  /^Bruxelles, Casablanca$/,
];
const translatable = /[A-Za-zÀ-ÿ\u0600-\u06ff]{2}/;
const allowed = (text, patterns) => patterns.some((pattern) => pattern.test(text.trim()));

for (const file of clientFiles.filter((item) => item.endsWith('.jsx') && !item.endsWith(`${path.sep}Icons.jsx`))) {
  const source = fs.readFileSync(file, 'utf8');
  const lines = source.split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const match of line.matchAll(/>([^<>{}=;]*[A-Za-zÀ-ÿ\u0600-\u06ff][^<>{}=;]*)</g)) {
      const prefix = line.slice(0, match.index + 1);
      const opening = prefix.lastIndexOf('<');
      if (opening < 0 || !/^<\/?[A-Za-z][^>]*>$/.test(prefix.slice(opening))) continue;
      const text = match[1].trim();
      if (translatable.test(text) && !allowed(text, allowedVisible)) {
        fail(`${path.relative(root, file)}:${index + 1}: texte JSX codé en dur: ${JSON.stringify(text)}`);
      }
    }
    for (const match of line.matchAll(/\b(?:placeholder|title|aria-label|alt|confirmLabel|message|help|empty)\s*=\s*(['"])([^'"]+)\1/g)) {
      const text = match[2].trim();
      if (translatable.test(text) && !allowed(text, allowedAttribute)) {
        fail(`${path.relative(root, file)}:${index + 1}: attribut UI codé en dur: ${JSON.stringify(text)}`);
      }
    }
    for (const match of line.matchAll(/\b(?:placeholder|title|aria-label|alt)\s*=\s*\{\s*`([^`]+)`\s*\}/g)) {
      const text = match[1].replace(/\$\{[^}]+\}/g, '1').trim();
      if (translatable.test(text) && !allowed(text, allowedAttribute)) {
        fail(`${path.relative(root, file)}:${index + 1}: attribut UI dynamique codé en dur: ${JSON.stringify(text)}`);
      }
    }
    for (const match of line.matchAll(/(?:toast\.(?:success|error|info|warn)|window\.(?:alert|confirm|prompt))\(\s*(['"])([^'"]+)\1/g)) {
      fail(`${path.relative(root, file)}:${index + 1}: alerte JS codée en dur: ${JSON.stringify(match[2])}`);
    }
    for (const match of line.matchAll(/new Error\(\s*(['"`])((?:\\.|(?!\1).)*?)\1\s*\)/g)) {
      fail(`${path.relative(root, file)}:${index + 1}: erreur JS codée en dur: ${JSON.stringify(match[2])}`);
    }
  });
  for (const match of source.matchAll(/\.toLocale(?:Date|Time)?String\(\s*(['"])([^'"]+)\1/g)) {
    const line = source.slice(0, match.index).split('\n').length;
    fail(`${path.relative(root, file)}:${line}: format de date forcé dans la langue ${match[2]}`);
  }
  for (const match of source.matchAll(/\.toLocale(?:Date|Time)?String\(\s*\)/g)) {
    const line = source.slice(0, match.index).split('\n').length;
    fail(`${path.relative(root, file)}:${line}: format de date dépendant du navigateur au lieu de dateLocale()`);
  }
}

const serverSource = fs.readFileSync(path.join(root, 'server/index.js'), 'utf8');
for (const match of serverSource.matchAll(/\.toLocale(?:Date|Time)?String\(\s*(['"])([^'"]+)\1/g)) {
  const line = serverSource.slice(0, match.index).split('\n').length;
  fail(`server/index.js:${line}: format de date forcé dans la langue ${match[2]}`);
}
for (const match of serverSource.matchAll(/\.toLocale(?:Date|Time)?String\(\s*\)/g)) {
  const line = serverSource.slice(0, match.index).split('\n').length;
  fail(`server/index.js:${line}: format de date dépendant du serveur`);
}
function checkServerLiteral(match, label) {
  let value;
  if (match[1] === '`') {
    value = match[2].replace(/\$\{[^}]+\}/g, '1');
  } else {
    value = Function(`return ${match[1]}${match[2]}${match[1]}`)();
  }
  if (!value.trim()) return;
  if (!ERRORS[value] && !PATTERNS.some((pattern) => pattern.re.test(value))) {
    const line = serverSource.slice(0, match.index).split('\n').length;
    fail(`server/index.js:${line}: ${label} sans traduction: ${value}`);
  }
}
for (const match of serverSource.matchAll(/\berror\s*:\s*(['"`])((?:\\.|(?!\1)[\s\S])*?)\1/g)) {
  checkServerLiteral(match, 'erreur API');
}
for (const match of serverSource.matchAll(/\bmessage\s*:\s*(['"`])((?:\\.|(?!\1)[\s\S])*?)\1/g)) {
  checkServerLiteral(match, 'message API');
}

const emailSource = fs.readFileSync(path.join(root, 'server/email.js'), 'utf8');
for (const match of emailSource.matchAll(/throw new Error\(\s*(['"`])((?:\\.|(?!\1)[\s\S])*?)\1\s*\)/g)) {
  const value = match[1] === '`'
    ? match[2].replace(/\$\{[^}]+\}/g, '1')
    : Function(`return ${match[1]}${match[2]}${match[1]}`)();
  if (!ERRORS[value] && !PATTERNS.some((pattern) => pattern.re.test(value))) {
    const line = emailSource.slice(0, match.index).split('\n').length;
    fail(`server/email.js:${line}: erreur utilisateur sans traduction: ${value}`);
  }
}
const { EMAIL_COPY } = await import(pathToFileURL(path.join(root, 'server/email.js')).href);
for (const lang of supportedLanguages) {
  if (!EMAIL_COPY[lang]) {
    fail(`Email: langue ${lang} absente`);
    continue;
  }
  for (const purpose of ['verify', 'reset', 'change_email', 'delete_account']) {
    const content = EMAIL_COPY[lang][purpose];
    if (!Array.isArray(content) || content.length !== 2 || !content[1].includes('{code}')) {
      fail(`Email ${purpose}: contenu ${lang} incomplet`);
    }
  }
  if (!EMAIL_COPY[lang].footer) fail(`Email: pied de page ${lang} absent`);
}
for (const [corridorId, corridor] of Object.entries(CUSTOMS)) {
  for (const lang of translatedLanguages) {
    const translated = corridor.i18n?.[lang];
    if (!translated) {
      fail(`Douane ${corridorId}: traduction ${lang} absente`);
      continue;
    }
    if (!translated.label || !translated.franchise) fail(`Douane ${corridorId}: libellés ${lang} incomplets`);
    if (translated.rules?.length !== corridor.rules.length) fail(`Douane ${corridorId}: règles ${lang} incomplètes`);
  }
}
for (const category of [...WHITELIST, ...BLACKLIST]) {
  for (const lang of translatedLanguages) {
    if (!category.i18n?.[lang]) fail(`Règles ${category.id}: libellé ${lang} absent`);
    if (category.reason && !category.reasonI18n?.[lang]) fail(`Règles ${category.id}: motif ${lang} absent`);
  }
}
for (const [message, translations] of Object.entries(ERRORS)) {
  for (const lang of translatedLanguages) {
    if (!translations[lang]) fail(`server/middleware/language.js: traduction ${lang} absente pour ${message}`);
  }
}
for (const [index, pattern] of PATTERNS.entries()) {
  for (const lang of translatedLanguages) {
    if (!pattern[lang]) fail(`Erreur dynamique ${index}: traduction ${lang} absente`);
  }
}
for (const match of serverSource.matchAll(/\{\s*key:\s*['"]([^'"]+)['"]/g)) {
  if (!TEMPLATES[match[1]]) fail(`Notification sans modèle: ${match[1]}`);
}
for (const [key, template] of Object.entries(TEMPLATES)) {
  const placeholderParams = new Proxy({}, { get: (_target, property) => `{${String(property)}}` });
  const expected = placeholders(template.fr(placeholderParams)).join('|');
  for (const lang of supportedLanguages) {
    if (typeof template[lang] !== 'function') fail(`Notification ${key}: modèle ${lang} absent`);
    else {
      const actual = placeholders(template[lang](placeholderParams)).join('|');
      if (actual !== expected) fail(`Notification ${key}: variables ${lang} incompatibles (${actual} au lieu de ${expected})`);
    }
  }
}

const systemBlock = serverSource.match(/const SYSTEM_EVENT_TEXT = \{([\s\S]*?)\n\};/)?.[1] || '';
for (const match of systemBlock.matchAll(/^\s*([a-z_]+)\s*:/gm)) {
  const key = `messages.system.${match[1]}`;
  for (const [lang, dict] of Object.entries({ fr: baseFr, nl: baseNl, ar: baseAr, en: baseEn, es: baseEs })) {
    if (!(key in dict)) fail(`${lang}: événement système sans traduction: ${key}`);
  }
}

if (failures.length) {
  console.error(`Échec du contrôle i18n (${failures.length} problème(s)):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}

console.log(`i18n valide: ${referenceKeys.length} clés, ${supportedLanguages.length} langues, ${literalKeys.size} clés utilisées et toutes les erreurs API couvertes.`);
