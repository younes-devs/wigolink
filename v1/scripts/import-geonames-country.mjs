import fs from 'node:fs';
import path from 'node:path';

const [, , inputPath, countryCode = 'MA'] = process.argv;
if (!inputPath) {
  console.error('Usage: node scripts/import-geonames-country.mjs <XX.txt> [countryCode]');
  process.exit(1);
}

const MIN_CITY_POPULATION = 500;
const ADMIN_SEAT = /^PPLA\d*$|^PPLC$/;
const outputPath = path.resolve(
  import.meta.dirname,
  `../server/data/locations/${countryCode.toUpperCase()}.json`,
);

const locations = fs.readFileSync(path.resolve(inputPath), 'utf8')
  .split(/\r?\n/)
  .filter(Boolean)
  .map(parseGeoName)
  .filter(Boolean)
  .sort((a, b) => (
    b.population - a.population
    || a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' })
  ));

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify({
  source: {
    provider: 'GeoNames',
    license: 'CC BY 4.0',
    url: `https://download.geonames.org/export/dump/${countryCode.toUpperCase()}.zip`,
    importedAt: new Date().toISOString().slice(0, 10),
    selection: `featureClass=P and (population>=${MIN_CITY_POPULATION} or administrative seat)`,
  },
  countryCode: countryCode.toUpperCase(),
  locations,
}, null, 2)}\n`);

console.log(`${locations.length} localités écrites dans ${outputPath}`);

function parseGeoName(line) {
  const columns = line.split('\t');
  const [
    geonameId,
    name,
    asciiName,
    alternateNames,
    latitude,
    longitude,
    featureClass,
    featureCode,
    rowCountryCode,
    ,
    admin1Code,
    admin2Code,
    ,
    ,
    population,
  ] = columns;
  const populationNumber = Number(population || 0);
  if (
    featureClass !== 'P'
    || rowCountryCode !== countryCode.toUpperCase()
    || (populationNumber < MIN_CITY_POPULATION && !ADMIN_SEAT.test(featureCode))
  ) return null;

  const aliases = uniqueNames([
    name,
    asciiName,
    ...(alternateNames || '').split(','),
  ]).filter((alias) => normalize(alias) !== normalize(name));

  return {
    id: `${countryCode.toLowerCase()}-${geonameId}`,
    name,
    asciiName,
    aliases,
    admin1Code: admin1Code || null,
    admin2Code: admin2Code || null,
    latitude: Number(latitude),
    longitude: Number(longitude),
    population: populationNumber,
    featureCode,
  };
}

function uniqueNames(values) {
  const seen = new Set();
  return values
    .map((value) => String(value || '').trim())
    .filter((value) => value.length > 1 && value.length <= 80)
    .filter((value) => {
      const key = normalize(value);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function normalize(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('fr')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '');
}
