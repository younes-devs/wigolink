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

test('catalogues francais et belge proposent leurs villes et variantes', () => {
  assert.equal(suggestLocations('Pari')[0]?.name, 'Paris');
  assert.equal(suggestLocations('Bruxelle')[0]?.name, 'Bruxelles');
  assert.equal(suggestLocations('Anvers')[0]?.name, 'Anvers');
  assert.equal(suggestLocations('Liege')[0]?.name, 'Liège');
});

test('canonisation reconnait une ville belge ou francaise', () => {
  assert.equal(canonicalizeLocation('Bruxelles').countryCode, 'BE');
  assert.equal(canonicalizeLocation('Paris').countryCode, 'FR');
});

test('matching relie alias et nom canonique', () => {
  assert.equal(locationMatches('Oujda', 'wjda'), true);
  assert.equal(locationMatches('Casablanca', 'cazablanca'), true);
  assert.equal(locationMatches('Rabat', 'wjda'), false);
});

test('migration canonise les villes des trois pays', () => {
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
  assert.match(result.trip.toLocationId, /^be-/);
  assert.equal(result.trip.toCountryCode, 'BE');

  const second = canonicalizeTripLocations(result.trip);
  assert.equal(second.changed, false);
});
