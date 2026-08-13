import locationsMA from './data/locations/MA.json' with { type: 'json' };
import aliasesMA from './data/location-aliases.ma.json' with { type: 'json' };
import namesMA from './data/location-names.ma.json' with { type: 'json' };
import locationsFR from './data/locations/FR.json' with { type: 'json' };
import aliasesFR from './data/location-aliases.fr.json' with { type: 'json' };
import namesFR from './data/location-names.fr.json' with { type: 'json' };
import locationsBE from './data/locations/BE.json' with { type: 'json' };
import aliasesBE from './data/location-aliases.be.json' with { type: 'json' };
import namesBE from './data/location-names.be.json' with { type: 'json' };

const MIN_QUERY_LENGTH = 2;
const MAX_SUGGESTIONS = 12;
const MAX_CACHE_ENTRIES = 300;
const suggestionCache = new Map();
const COUNTRY_DATA = {
  MA: prepareCountry(locationsMA, aliasesMA, namesMA),
  FR: prepareCountry(locationsFR, aliasesFR, namesFR),
  BE: prepareCountry(locationsBE, aliasesBE, namesBE),
};
const SUPPORTED_COUNTRIES = Object.keys(COUNTRY_DATA);

export function normalizeLocationText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('fr')
    .replace(/[’'`]/g, ' ')
    .replace(/[^\p{Letter}\p{Number}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function compactLocationText(value) {
  return normalizeLocationText(value).replace(/\s+/g, '');
}

export function suggestLocations(query, {
  countryCode = 'ALL',
  limit = 8,
} = {}) {
  const normalized = normalizeLocationText(query);
  const compact = compactLocationText(normalized);
  if (compact.length < MIN_QUERY_LENGTH) return [];
  const countryCodes = resolveCountryCodes(countryCode);
  if (!countryCodes.length) return [];
  const cacheKey = `${countryCodes.join(',')}:${compact}:${boundedLimit(limit)}`;
  const cached = suggestionCache.get(cacheKey);
  if (cached) return cached.map((item) => ({ ...item }));

  const threshold = scoreThreshold(compact.length);
  const initial = compact[0];
  const results = countryCodes.flatMap((code) => (
    COUNTRY_DATA[code].byInitial.get(initial) || COUNTRY_DATA[code].locations
  ))
    .map((location) => scoreLocation(location, normalized, compact))
    .filter((result) => result.score >= threshold)
    .sort(compareResults)
    .slice(0, boundedLimit(limit))
    .map(publicResult);
  suggestionCache.set(cacheKey, results);
  if (suggestionCache.size > MAX_CACHE_ENTRIES) {
    suggestionCache.delete(suggestionCache.keys().next().value);
  }
  return results.map((item) => ({ ...item }));
}

export function findLocationById(id, countryCode = 'ALL') {
  const location = resolveCountryCodes(countryCode)
    .map((code) => COUNTRY_DATA[code].byId.get(String(id || '')))
    .find(Boolean);
  return location ? publicResult({ location, score: 1, matchedName: location.displayName }) : null;
}

export function canonicalizeLocation(value, {
  locationId,
  countryCode = 'ALL',
  minimumScore = 0.84,
} = {}) {
  const selected = locationId ? findLocationById(locationId, countryCode) : null;
  const candidate = selected || suggestLocations(value, { countryCode, limit: 2 })[0];
  if (!candidate || candidate.score < minimumScore) {
    return {
      id: null,
      countryCode: null,
      name: String(value || '').trim().slice(0, 60),
      latitude: null,
      longitude: null,
      confidence: 0,
    };
  }
  return {
    id: candidate.id,
    countryCode: candidate.countryCode,
    name: candidate.name,
    latitude: candidate.latitude,
    longitude: candidate.longitude,
    confidence: candidate.score,
  };
}

export function locationMatches(value, query, {
  locationId,
  countryCode = 'ALL',
} = {}) {
  const needle = normalizeLocationText(query);
  if (!needle) return true;
  const normalizedValue = normalizeLocationText(value);
  if (normalizedValue.includes(needle)) return true;

  const selected = locationId ? findLocationById(locationId, countryCode) : null;
  const searched = suggestLocations(query, { countryCode, limit: 1 })[0];
  if (!searched) return false;
  if (selected?.id) return selected.id === searched.id;

  const stored = suggestLocations(value, { countryCode, limit: 1 })[0];
  return !!stored && stored.id === searched.id && stored.score >= 0.78;
}

export function locationQueryTerms(query, {
  countryCode = 'ALL',
  limit = 10,
} = {}) {
  const suggestion = suggestLocations(query, { countryCode, limit: 1 })[0];
  if (!suggestion) return [String(query || '').trim()].filter(Boolean);
  const country = COUNTRY_DATA[suggestion.countryCode];
  const location = country?.byId.get(suggestion.id);
  return unique([
    query,
    location?.displayName,
    location?.name,
    location?.asciiName,
    ...(location?.customAliases || []),
  ]).slice(0, Math.max(1, limit));
}

export function locationCatalogStats(countryCode = 'ALL') {
  const countries = resolveCountryCodes(countryCode).map((code) => COUNTRY_DATA[code]);
  return {
    countryCode: String(countryCode).toUpperCase(),
    locations: countries.reduce((total, country) => total + country.locations.length, 0),
    names: countries.reduce((total, country) => total + country.locations.reduce((sum, location) => sum + location.names.length, 0), 0),
  };
}

export function canonicalizeTripLocations(trip) {
  const next = { ...trip };
  let changed = false;
  for (const endpoint of ['from', 'to']) {
    const prefix = endpoint;
    const canonical = canonicalizeLocation(trip?.[endpoint], {
      locationId: trip?.[`${prefix}LocationId`],
      countryCode: trip?.[`${prefix}CountryCode`] || 'ALL',
    });
    if (!canonical.id) continue;
    const fields = {
      [endpoint]: canonical.name,
      [`${prefix}LocationId`]: canonical.id,
      [`${prefix}CountryCode`]: canonical.countryCode,
      [`${prefix}Coordinates`]: {
        latitude: canonical.latitude,
        longitude: canonical.longitude,
      },
    };
    for (const [key, value] of Object.entries(fields)) {
      if (JSON.stringify(next[key]) === JSON.stringify(value)) continue;
      next[key] = value;
      changed = true;
    }
  }
  return { trip: next, changed };
}

function prepareCountry(data, customAliases, preferredNames) {
  const locations = data.locations.map((source) => {
    const displayName = preferredNames[source.name]
      || preferredNames[source.asciiName]
      || source.name;
    const custom = customAliases[source.name]
      || customAliases[source.asciiName]
      || customAliases[displayName]
      || [];
    const rawNames = unique([
      displayName,
      source.name,
      source.asciiName,
      ...custom,
      ...source.aliases,
    ]);
    const names = rawNames.map((name) => ({
      value: name,
      normalized: normalizeLocationText(name),
      compact: compactLocationText(name),
      custom: custom.some((alias) => compactLocationText(alias) === compactLocationText(name)),
    }));
    return {
      ...source,
      countryCode: data.countryCode,
      displayName,
      customAliases: custom,
      names,
      popularity: popularityScore(source.population, source.featureCode),
    };
  });
  return {
    locations,
    byId: new Map(locations.map((location) => [location.id, location])),
    byInitial: indexLocationsByInitial(locations),
  };
}

function indexLocationsByInitial(locations) {
  const index = new Map();
  for (const location of locations) {
    const initials = new Set(location.names.map((name) => name.compact[0]).filter(Boolean));
    for (const initial of initials) {
      if (!index.has(initial)) index.set(initial, []);
      index.get(initial).push(location);
    }
  }
  return index;
}

function scoreLocation(location, query, compactQuery) {
  let best = { score: 0, matchedName: location.displayName, matchedCustom: false };
  for (const name of location.names) {
    const score = scoreName(name, query, compactQuery);
    if (score > best.score) {
      best = { score, matchedName: name.value, matchedCustom: name.custom };
    }
    if (score === 1) break;
  }
  return { location, ...best };
}

function scoreName(name, query, compactQuery) {
  if (!name.compact) return 0;
  if (name.normalized === query) return 1;
  if (name.compact === compactQuery) return 0.995;
  if (name.normalized.startsWith(query)) {
    return 0.93 - Math.min(0.08, (name.normalized.length - query.length) * 0.004);
  }
  if (name.compact.startsWith(compactQuery)) {
    return 0.91 - Math.min(0.08, (name.compact.length - compactQuery.length) * 0.004);
  }
  if (query.length >= 4 && name.normalized.includes(query)) return 0.84;
  if (compactQuery.length <= 2) return 0;

  const distance = damerauLevenshtein(compactQuery, name.compact);
  const editScore = 1 - distance / Math.max(compactQuery.length, name.compact.length);
  const trigramScore = trigramSimilarity(compactQuery, name.compact);
  return Math.max(editScore * 0.94, trigramScore * 0.9);
}

function compareResults(a, b) {
  const scoreDifference = b.score - a.score;
  if (Math.abs(scoreDifference) > 0.025) return scoreDifference;
  return b.location.popularity - a.location.popularity
    || a.location.displayName.localeCompare(b.location.displayName, 'fr');
}

function publicResult({
  location,
  score,
  matchedName,
  matchedCustom = false,
}) {
  return {
    id: location.id,
    countryCode: location.countryCode,
    name: location.displayName,
    admin1Code: location.admin1Code,
    latitude: location.latitude,
    longitude: location.longitude,
    population: location.population,
    matchedName,
    matchedAlias: matchedCustom ? matchedName : null,
    score: Math.round(score * 1000) / 1000,
  };
}

function popularityScore(population, featureCode) {
  const adminBoost = /^PPLC$/.test(featureCode)
    ? 4
    : /^PPLA$/.test(featureCode)
      ? 3
      : /^PPLA2$/.test(featureCode)
        ? 2
        : /^PPLA/.test(featureCode)
          ? 1
          : 0;
  return Math.log10(Math.max(1, Number(population || 0))) + adminBoost;
}

function scoreThreshold(length) {
  if (length <= 2) return 0.9;
  if (length === 3) return 0.74;
  if (length === 4) return 0.68;
  return 0.64;
}

function trigramSimilarity(left, right) {
  const leftTrigrams = trigrams(left);
  const rightTrigrams = trigrams(right);
  if (!leftTrigrams.size || !rightTrigrams.size) return 0;
  let common = 0;
  for (const trigram of leftTrigrams) if (rightTrigrams.has(trigram)) common += 1;
  return (2 * common) / (leftTrigrams.size + rightTrigrams.size);
}

function trigrams(value) {
  const padded = `  ${value} `;
  const values = new Set();
  for (let index = 0; index <= padded.length - 3; index += 1) {
    values.add(padded.slice(index, index + 3));
  }
  return values;
}

function damerauLevenshtein(left, right) {
  const rows = left.length + 1;
  const columns = right.length + 1;
  const matrix = Array.from({ length: rows }, () => Array(columns).fill(0));
  for (let row = 0; row < rows; row += 1) matrix[row][0] = row;
  for (let column = 0; column < columns; column += 1) matrix[0][column] = column;
  for (let row = 1; row < rows; row += 1) {
    for (let column = 1; column < columns; column += 1) {
      const cost = left[row - 1] === right[column - 1] ? 0 : 1;
      matrix[row][column] = Math.min(
        matrix[row - 1][column] + 1,
        matrix[row][column - 1] + 1,
        matrix[row - 1][column - 1] + cost,
      );
      if (
        row > 1
        && column > 1
        && left[row - 1] === right[column - 2]
        && left[row - 2] === right[column - 1]
      ) {
        matrix[row][column] = Math.min(
          matrix[row][column],
          matrix[row - 2][column - 2] + cost,
        );
      }
    }
  }
  return matrix[left.length][right.length];
}

function boundedLimit(value) {
  const numeric = Number(value || 8);
  return Math.max(1, Math.min(MAX_SUGGESTIONS, Number.isFinite(numeric) ? Math.floor(numeric) : 8));
}

function resolveCountryCodes(value) {
  const requested = String(value || 'ALL').toUpperCase();
  if (requested === 'ALL') return SUPPORTED_COUNTRIES;
  return requested.split(',').map((code) => code.trim()).filter((code) => COUNTRY_DATA[code]);
}

function unique(values) {
  const seen = new Set();
  return values
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .filter((value) => {
      const key = compactLocationText(value);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}
