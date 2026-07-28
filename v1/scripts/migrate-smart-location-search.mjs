import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalizeTripLocations } from '../server/location-search.js';
import { createPostgresPool } from '../server/postgres-repositories.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const write = process.argv.includes('--write');
const sql = fs.readFileSync(path.join(root, 'supabase', 'smart-location-search.sql'), 'utf8');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL est requis. Ne partagez jamais cette valeur dans un chat.');
}

const pool = createPostgresPool({ connectionString: process.env.DATABASE_URL, max: 1 });
const client = await pool.connect();
try {
  await client.query('begin');
  const result = await client.query('select state from public.wigofly_app_state where id = 1 for update');
  if (!result.rows[0]?.state) throw new Error('Etat Wigofly introuvable dans Supabase.');

  const state = result.rows[0].state;
  let changed = 0;
  state.trips = (state.trips || []).map((trip) => {
    const canonical = canonicalizeTripLocations(trip);
    if (canonical.changed) changed += 1;
    return canonical.trip;
  });

  if (!write) {
    await client.query('rollback');
    console.log(JSON.stringify({ dryRun: true, trips: state.trips.length, changed }, null, 2));
  } else {
    await client.query(sql);
    if (changed > 0) {
      await client.query(
        `update public.wigofly_app_state
         set state = $1::jsonb, updated_at = now(), revision = revision + 1
         where id = 1`,
        [JSON.stringify(state)],
      );
      for (const trip of state.trips) {
        await client.query(
          `insert into public.wigofly_trips (id, data, created_at, updated_at)
           values ($1, $2::jsonb, coalesce(to_timestamp($3 / 1000.0), now()), now())
           on conflict (id) do update set data = excluded.data, updated_at = now()`,
          [trip.id, JSON.stringify(trip), entityTimestamp(trip)],
        );
      }
    }
    await client.query('commit');
    console.log(JSON.stringify({ dryRun: false, trips: state.trips.length, changed, indexes: 'ready' }, null, 2));
  }
} catch (error) {
  await client.query('rollback').catch(() => {});
  throw error;
} finally {
  client.release();
  await pool.end();
}

function entityTimestamp(entity) {
  const value = entity?.createdAt || entity?.updatedAt || Date.now();
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : Date.now();
}
