const tripOverviewCache = new Map();

export const TRIP_OVERVIEW_CACHE_MS = 30_000;
export const TRIP_SESSION_PREFIX = 'wigolink:trips:';

export function readTripCache(query) {
  const memory = tripOverviewCache.get(query);
  if (memory) return memory;
  try {
    const stored = JSON.parse(sessionStorage.getItem(`${TRIP_SESSION_PREFIX}${query}`));
    if (stored) tripOverviewCache.set(query, stored);
    return stored;
  } catch {
    return null;
  }
}

export function writeTripCache(query, value) {
  tripOverviewCache.set(query, value);
  try {
    sessionStorage.setItem(`${TRIP_SESSION_PREFIX}${query}`, JSON.stringify(value));
  } catch {
    // The in-memory cache remains available when browser storage is full.
  }
}

export function invalidateTripFeedCache() {
  tripOverviewCache.clear();
  try {
    for (let index = sessionStorage.length - 1; index >= 0; index -= 1) {
      const key = sessionStorage.key(index);
      if (key?.startsWith(TRIP_SESSION_PREFIX)) sessionStorage.removeItem(key);
    }
  } catch {
    // A fresh network request still runs when session storage is unavailable.
  }
}
