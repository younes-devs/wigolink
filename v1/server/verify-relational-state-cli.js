import { createPostgresPool } from './postgres-repositories.js';
import { verifyRelationalState } from './verify-relational-state.js';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL est requis. Ne partagez jamais cette valeur dans un chat.');
}

const pool = createPostgresPool({ connectionString: process.env.DATABASE_URL });
try {
  const result = await verifyRelationalState(pool);
  console.log(JSON.stringify(result, null, 2));
  if (!result.ready) process.exitCode = 1;
} finally {
  await pool.end();
}
