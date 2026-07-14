import { createPostgresPool } from './postgres-repositories.js';
import {
  MIGRATABLE_COLLECTIONS,
  loadJsonData,
  migrateJsonToPostgres,
  parseCollections,
} from './migrate-json-postgres.js';

const args = parseArgs(process.argv.slice(2));
const dryRun = !args.write;
const collections = parseCollections(args.collections || MIGRATABLE_COLLECTIONS.join(','));
const dataFile = args.dataFile || process.env.DATA_FILE;
const data = loadJsonData(dataFile);

let pool = null;
try {
  if (!dryRun) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL est requis avec --write.');
    }
    pool = createPostgresPool({ connectionString: process.env.DATABASE_URL });
  }

  const summary = await migrateJsonToPostgres({ data, pool, collections, dryRun });
  console.log(JSON.stringify(summary, null, 2));
} finally {
  if (pool) await pool.end();
}

function parseArgs(argv) {
  const parsed = {};
  for (const arg of argv) {
    if (arg === '--write') {
      parsed.write = true;
    } else if (arg.startsWith('--collections=')) {
      parsed.collections = arg.slice('--collections='.length);
    } else if (arg.startsWith('--data-file=')) {
      parsed.dataFile = arg.slice('--data-file='.length);
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Argument inconnu: ${arg}`);
    }
  }
  return parsed;
}

function printHelp() {
  console.log(`Usage:
  npm run migrate:plan
  npm run migrate:postgres -- --write
  node server/migrate-json-postgres-cli.js --collections=auditLogs,notifications,messages

Options:
  --write                         Ecrit dans Postgres. Sans ce flag: dry-run.
  --collections=a,b               Collections: auditLogs, notifications, messages.
  --data-file=C:\\path\\data.json  Fichier JSON source. Defaut: DATA_FILE ou server/data.json.
`);
}
