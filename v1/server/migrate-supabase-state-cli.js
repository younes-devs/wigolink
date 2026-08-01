import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { emptyState } from './store.js';
import { createPostgresPool } from './postgres-repositories.js';

const defaultDataFile = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data.json');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL est requis. Ne partagez jamais cette valeur dans un chat.');
}

const dataFile = process.argv.find((arg) => arg.startsWith('--data-file='))?.slice('--data-file='.length) || defaultDataFile;
const useEmptyState = process.argv.includes('--empty');
const state = useEmptyState ? emptyState() : JSON.parse(fs.readFileSync(dataFile, 'utf8'));
const pool = createPostgresPool({ connectionString: process.env.DATABASE_URL });

try {
  await pool.query(
    `insert into wigolink_app_state (id, state)
     values (1, $1::jsonb)
     on conflict (id) do update set state = excluded.state, updated_at = now(), revision = wigolink_app_state.revision + 1`,
    [JSON.stringify(state)]
  );
  console.log(`Etat ${useEmptyState ? 'vide' : 'local'} importe dans Supabase.`);
} finally {
  await pool.end();
}
