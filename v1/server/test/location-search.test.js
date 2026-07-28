import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalizeTripLocations,
  canonicalizeLocation,
  locationCatalogStats,
  locationMatches,
  normalizeLocationText,
  suggestLocations,
} from '../location-search.js';

test('catalogue marocain contient les villes et centres administratifs', () => {
  const stats = locationCatalogStats('MA');
  assert.ok(stats.locations >= 450);
  assert.ok(stats.names > stats.locations * 3);
});

test('normalisation ignore casse, accents et ponctuation', () => {
  assert.equal(normalizeLocationText('  Béni-Mellal '), 'beni mellal');
  assert.equal(normalizeLocationText('FÈS'), 'fes');
});

test('recherche reconnait alias, fautes courantes et arabe', () => {
  assert.equal(suggestLocations('wjda')[0]?.name, 'Oujda');
  assert.equal(suggestLocations('marakech')[0]?.name, 'Marrakech');
  assert.equal(suggestLocations('casa')[0]?.name, 'Casablanca');
  assert.equal(suggestLocations('وجدة')[0]?.name, 'Oujda');
});

test('recherche corrige une faute non repertoriee et une inversion', () => {
  assert.equal(suggestLocations('oujdaa')[0]?.name, 'Oujda');
  assert.equal(suggestLocations('agda ir')[0]?.name, 'Agadir');
});

test('recherche refuse une ville etrangere sans candidat marocain fiable', () => {
  assert.deepEqual(suggestLocations('Bruxelles'), []);
  assert.deepEqual(suggestLocations('Paris'), []);
});

test('canonisation conserve une ville etrangere libre', () => {
  assert.deepEqual(canonicalizeLocation('Bruxelles'), {
    id: null,
    countryCode: null,
    name: 'Bruxelles',
    latitude: null,
    longitude: null,
    confidence: 0,
  });
});

test('matching relie alias et nom canonique', () => {
  assert.equal(locationMatches('Oujda', 'wjda'), true);
  assert.equal(locationMatches('Casablanca', 'cazablanca'), true);
  assert.equal(locationMatches('Rabat', 'wjda'), false);
});

test('migration canonise les trajets marocains et conserve les villes etrangeres', () => {
  const result = canonicalizeTripLocations({
    id: 't-1',
    from: 'wjda',
    to: 'Bruxelles',
  });
  assert.equal(result.changed, true);
  assert.equal(result.trip.from, 'Oujda');
  assert.equal(result.trip.fromLocationId, 'ma-2540483');
  assert.equal(result.trip.fromCountryCode, 'MA');
  assert.equal(result.trip.to, 'Bruxelles');
  assert.equal(result.trip.toLocationId, undefined);

  const second = canonicalizeTripLocations(result.trip);
  assert.equal(second.changed, false);
});
