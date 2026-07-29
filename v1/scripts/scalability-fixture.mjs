import pg from 'pg';
import { pathToFileURL } from 'node:url';

const { Pool } = pg;
const CONFIRMATION = 'STAGING_ONLY';
const PROFILES = Object.freeze({
  small: {
    users: 1_000,
    trips: 10_000,
    operations: 5_000,
    conversations: 2_000,
    messages: 50_000,
  },
  medium: {
    users: 10_000,
    trips: 100_000,
    operations: 50_000,
    conversations: 20_000,
    messages: 500_000,
  },
  large: {
    users: 50_000,
    trips: 500_000,
    operations: 250_000,
    conversations: 100_000,
    messages: 2_000_000,
  },
});

export function fixtureConfig({
  env = process.env,
  argv = process.argv.slice(2),
} = {}) {
  if (env.SCALABILITY_FIXTURE_CONFIRM !== CONFIRMATION) {
    throw new Error(
      `Definissez SCALABILITY_FIXTURE_CONFIRM=${CONFIRMATION}.`,
    );
  }
  if (env.NODE_ENV === 'production' || env.VERCEL_ENV === 'production') {
    throw new Error('Le jeu de charge est interdit en production.');
  }
  const connectionString = String(
    env.SCALABILITY_DATABASE_URL || '',
  ).trim();
  if (!connectionString) {
    throw new Error(
      'SCALABILITY_DATABASE_URL est requis et doit viser la base de staging.',
    );
  }
  const profileName = argumentValue(argv, '--profile') || 'small';
  const profile = PROFILES[profileName];
  if (!profile) {
    throw new Error(
      `Profil inconnu: ${profileName}. Utilisez ${Object.keys(PROFILES).join(', ')}.`,
    );
  }
  const runId = (
    argumentValue(argv, '--run-id')
    || env.SCALABILITY_FIXTURE_RUN
    || `load-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}`
  ).toLowerCase();
  if (!/^[a-z0-9-]{3,24}$/.test(runId)) {
    throw new Error(
      'Le run-id doit contenir 3 a 24 caracteres: a-z, 0-9 ou tiret.',
    );
  }
  return {
    connectionString,
    profileName,
    profile,
    runId,
    cleanup: argv.includes('--cleanup'),
    ssl: env.SCALABILITY_DATABASE_SSL !== 'false',
  };
}

export async function runFixture(config) {
  const pool = new Pool({
    connectionString: config.connectionString,
    max: 1,
    ssl: config.ssl ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 5_000,
    allowExitOnIdle: true,
  });
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(
      'select pg_advisory_xact_lock(hashtext($1))',
      [`wigofly:scalability-fixture:${config.runId}`],
    );
    const removed = await cleanupFixture(client, config.runId);
    if (config.cleanup) {
      await client.query('commit');
      return { mode: 'cleanup', runId: config.runId, removed };
    }
    await seedFixture(client, config);
    await analyzeFixture(client);
    await client.query('commit');
    return {
      mode: 'seed',
      runId: config.runId,
      profile: config.profileName,
      inserted: { ...config.profile },
      replaced: removed,
    };
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

async function seedFixture(client, { runId, profile }) {
  await client.query(
    `insert into public.wigofly_users (id, data, created_at, updated_at)
     select
       $1 || '-u-' || item,
       jsonb_build_object(
         'id', $1 || '-u-' || item,
         'name', 'Charge membre ' || item,
         'email', $1 || '-u-' || item || '@load.invalid',
         'emailVerified', true,
         'provider', 'email',
         'kycStatus', 'verified',
         'isAdmin', false,
         'createdAt', floor(extract(epoch from now()) * 1000)::bigint,
         'fixtureRun', $1
       ),
       now(),
       now()
     from generate_series(1, $2::int) item`,
    [runId, profile.users],
  );

  await client.query(
    `insert into public.wigofly_trips (id, data, created_at, updated_at)
     select
       $1 || '-t-' || item,
       jsonb_build_object(
         'id', $1 || '-t-' || item,
         'travelerId', $1 || '-u-' || (((item - 1) % $3::int) + 1),
         'from', case when item % 2 = 0 then 'Oujda' else 'Casablanca' end,
         'to', case when item % 2 = 0 then 'Bruxelles' else 'Paris' end,
         'date', (current_date + ((item % 120) + 1))::text,
         'departureDate', (current_date + ((item % 120) + 1))::text,
         'capacityKg', ((item % 20) + 1),
         'price', ((item % 50) + 3),
         'status', 'published',
         'transportMode', case when item % 3 = 0 then 'car' else 'plane' end,
         'createdAt', floor(extract(epoch from now()) * 1000)::bigint,
         'fixtureRun', $1
       ),
       now(),
       now()
     from generate_series(1, $2::int) item`,
    [runId, profile.trips, profile.users],
  );

  await client.query(
    `insert into public.wigofly_conversations
       (id, data, created_at, updated_at)
     select
       $1 || '-c-' || item,
       jsonb_build_object(
         'id', $1 || '-c-' || item,
         'participantIds', jsonb_build_array(
           $1 || '-u-' || (((item - 1) % $3::int) + 1),
           $1 || '-u-' || ((item % $3::int) + 1)
         ),
         'tripId', $1 || '-t-' || (((item - 1) % $4::int) + 1),
         'createdAt', floor(extract(epoch from now()) * 1000)::bigint,
         'lastMessageAt',
           floor(extract(epoch from now() - (item % 86400) * interval '1 second') * 1000)::bigint,
         'fixtureRun', $1
       ),
       now() - (item % 86400) * interval '1 second',
       now()
     from generate_series(1, $2::int) item`,
    [runId, profile.conversations, profile.users, profile.trips],
  );

  await client.query(
    `insert into public.wigofly_conversation_members
       (conversation_id, user_id, last_read_at, created_at, updated_at)
     select
       conversation.id,
       participant.value,
       now() - interval '30 minutes',
       conversation.created_at,
       now()
     from public.wigofly_conversations conversation
     cross join lateral jsonb_array_elements_text(
       conversation.data->'participantIds'
     ) participant(value)
     where conversation.data->>'fixtureRun' = $1`,
    [runId],
  );

  await client.query(
    `insert into public.messages
       (id, tx_id, from_id, text, flagged, at, conversation_id, client_id, data)
     select
       $1 || '-m-' || item,
       null,
       $1 || '-u-' || (((item - 1) % $4::int) + 1),
       'Message de charge ' || item,
       false,
       now() - (item % 604800) * interval '1 second',
       $1 || '-c-' || (((item - 1) % $3::int) + 1),
       $1 || '-client-' || item,
       jsonb_build_object(
         'id', $1 || '-m-' || item,
         'conversationId', $1 || '-c-' || (((item - 1) % $3::int) + 1),
         'from', $1 || '-u-' || (((item - 1) % $4::int) + 1),
         'text', 'Message de charge ' || item,
         'type', 'text',
         'at',
           floor(extract(epoch from now() - (item % 604800) * interval '1 second') * 1000)::bigint,
         'hiddenForParticipants', false,
         'fixtureRun', $1
       )
     from generate_series(1, $2::int) item`,
    [runId, profile.messages, profile.conversations, profile.users],
  );

  await client.query(
    `insert into public.wigofly_transactions
       (id, data, created_at, updated_at)
     select
       $1 || '-tx-' || item,
       jsonb_build_object(
         'id', $1 || '-tx-' || item,
         'senderId', $1 || '-u-' || (((item - 1) % $4::int) + 1),
         'travelerId', $1 || '-u-' || ((item % $4::int) + 1),
         'recipientId', $1 || '-u-' || (((item + 1) % $4::int) + 1),
         'tripId', $1 || '-t-' || (((item - 1) % $3::int) + 1),
         'status', case when item % 4 = 0 then 'released' else 'accepted' end,
         'createdAt',
           floor(extract(epoch from now() - (item % 2592000) * interval '1 second') * 1000)::bigint,
         'fixtureRun', $1
       ),
       now() - (item % 2592000) * interval '1 second',
       now()
     from generate_series(1, $2::int) item`,
    [runId, profile.operations, profile.trips, profile.users],
  );
}

async function cleanupFixture(client, runId) {
  const counts = {};
  counts.messages = await deleteRows(
    client,
    `delete from public.messages where data->>'fixtureRun' = $1`,
    runId,
  );
  counts.conversationMembers = await deleteRows(
    client,
    `delete from public.wigofly_conversation_members member
     using public.wigofly_conversations conversation
     where member.conversation_id = conversation.id
       and conversation.data->>'fixtureRun' = $1`,
    runId,
  );
  for (const [name, table] of [
    ['operations', 'wigofly_transactions'],
    ['conversations', 'wigofly_conversations'],
    ['trips', 'wigofly_trips'],
    ['users', 'wigofly_users'],
  ]) {
    counts[name] = await deleteRows(
      client,
      `delete from public.${table} where data->>'fixtureRun' = $1`,
      runId,
    );
  }
  return counts;
}

async function deleteRows(client, sql, runId) {
  const result = await client.query(sql, [runId]);
  return result.rowCount;
}

async function analyzeFixture(client) {
  for (const table of [
    'wigofly_users',
    'wigofly_trips',
    'wigofly_transactions',
    'wigofly_conversations',
    'wigofly_conversation_members',
    'messages',
  ]) {
    await client.query(`analyze public.${table}`);
  }
}

function argumentValue(argv, name) {
  const prefix = `${name}=`;
  const match = argv.find((item) => item.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

async function main() {
  const config = fixtureConfig();
  const result = await runFixture(config);
  console.log(JSON.stringify(result, null, 2));
}

const invokedPath = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : '';
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
