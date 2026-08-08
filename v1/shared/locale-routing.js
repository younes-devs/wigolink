export const SUPPORTED_LOCALES = Object.freeze(['fr', 'ar', 'nl', 'en', 'es']);
export const DEFAULT_LOCALE = 'fr';
export const LOCALE_COOKIE = 'wigolink_lang';

const SUPPORTED = new Set(SUPPORTED_LOCALES);

export function normalizeLocale(value) {
  const locale = String(value || '').trim().toLowerCase().split(/[-_]/, 1)[0];
  return SUPPORTED.has(locale) ? locale : null;
}

export function localeFromPath(pathname) {
  const path = String(pathname || '').split(/[?#]/, 1)[0];
  const segment = path.match(/^\/([^/]+)(?:\/|$)/)?.[1];
  return normalizeLocale(segment);
}

function splitPathSuffix(value) {
  const input = String(value || '/');
  const suffixIndex = input.search(/[?#]/);
  return suffixIndex < 0
    ? { pathname: input, suffix: '' }
    : { pathname: input.slice(0, suffixIndex), suffix: input.slice(suffixIndex) };
}

export function stripLocalePrefix(pathLike) {
  const { pathname: rawPathname, suffix } = splitPathSuffix(pathLike);
  const pathname = rawPathname.startsWith('/') ? rawPathname : `/${rawPathname}`;
  const match = pathname.match(/^\/([^/]+)(\/.*)?$/);
  if (!match || !normalizeLocale(match[1])) return `${pathname || '/'}${suffix}`;
  return `${match[2] || '/'}${suffix}`;
}

export function localizePath(pathLike, locale) {
  const normalized = normalizeLocale(locale) || DEFAULT_LOCALE;
  const { pathname, suffix } = splitPathSuffix(stripLocalePrefix(pathLike));
  const cleanPath = pathname === '/' ? '' : pathname;
  return `/${normalized}${cleanPath}${suffix}`;
}

export function localeFromLanguagePreferences(values = []) {
  for (const value of values) {
    const locale = normalizeLocale(value);
    if (locale) return locale;
  }
  return null;
}

export function localeFromAcceptLanguage(header) {
  const candidates = String(header || '')
    .split(',')
    .map((entry, index) => {
      const [tag, ...parameters] = entry.trim().split(';');
      const qualityParameter = parameters.find((parameter) => parameter.trim().toLowerCase().startsWith('q='));
      const quality = qualityParameter ? Number(qualityParameter.split('=')[1]) : 1;
      return {
        locale: tag === '*' ? null : normalizeLocale(tag),
        quality: Number.isFinite(quality) && quality >= 0 && quality <= 1 ? quality : 0,
        index,
      };
    })
    .filter(({ locale, quality }) => locale && quality > 0)
    .sort((left, right) => right.quality - left.quality || left.index - right.index);

  return candidates[0]?.locale || null;
}

export function readLocaleCookie(cookieHeader, name = LOCALE_COOKIE) {
  for (const part of String(cookieHeader || '').split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    try {
      return normalizeLocale(decodeURIComponent(part.slice(separator + 1).trim()));
    } catch {
      return null;
    }
  }
  return null;
}

export function resolveRequestLocale({ cookieHeader, acceptLanguage } = {}) {
  return readLocaleCookie(cookieHeader)
    || localeFromAcceptLanguage(acceptLanguage)
    || DEFAULT_LOCALE;
}
