import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrateStateToRelational } from './migrate-relational-state.js';
import { createPostgresPool } from './postgres-repositories.js';

const defaultDataFile = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data.json');
const dataFile = process.argv.find((arg) => arg.startsWith('--data-file='))?.slice('--data-file='.length) || defaultDataFile;
const write = process.argv.includes('--write');
const state = JSON.parse(fs.readFileSync(dataFile, 'utf8'));

if (!write) {
  console.log(JSON.stringify(await migrateStateToRelational({ state, dryRun: true }), null, 2));
  process.exit(0);
}
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL est requis avec --write. Ne le partagez jamais dans un chat.');

const pool = createPostgresPool({ connectionString: process.env.DATABASE_URL });
try {
  const result = await migrateStateToRelational({ state, pool, dryRun: false });
  console.log(JSON.stringify(result, null, 2));
} finally {
  await pool.end();
}
