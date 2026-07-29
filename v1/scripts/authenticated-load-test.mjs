import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import {
  createPostgresPool,
  databasePoolOptions,
} from '../server/postgres-repositories.js';
import { runLoadScenario } from './load-test.mjs';

const DEFAULT_SCENARIOS = [
  { name: 'navigation', path: '/api/navigation-summary' },
  { name: 'trips', path: '/api/trips/overview?limit=20' },
  { name: 'conversations', path: '/api/conversations?limit=20' },
  { name: 'operations', path: '/api/operations?limit=20' },
];

export async function runAuthenticatedLoadTest({
  databaseUrl,
  baseUrl,
  requests = 30,
  concurrency = 5,
  maxP95Ms = 1_000,
  maxFailureRate = 0.01,
  fetchImpl = fetch,
  pool: providedPool = null,
}) {
  if (!databaseUrl && !providedPool) {
    throw new Error('DATABASE_URL est requis.');
  }
  if (!baseUrl) throw new Error('LOAD_TEST_URL est requis.');

  const ownsPool = !providedPool;
  const pool = providedPool || createPostgresPool({
    connectionString: databaseUrl,
    ...databasePoolOptions(process.env),
  });
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  let sessionCreated = false;

  try {
    const member = await loadTestMember(pool);
    if (!member) {
      throw new Error('Aucun membre actif ne permet un test authentifie.');
    }
    await pool.query(
      `insert into public.wigofly_sessions
         (token_hash, user_id, created_at, expires_at)
       values ($1, $2, now(), now() + interval '15 minutes')`,
      [tokenHash, member.userId],
    );
    sessionCreated = true;

    const scenarios = [...DEFAULT_SCENARIOS];
    if (member.conversationId) {
      scenarios.push({
        name: 'messages',
        path: `/api/conversations/${encodeURIComponent(member.conversationId)}/messages?limit=50`,
      });
    }

    const results = [];
    for (const scenario of scenarios) {
      await warmRoute({
        baseUrl,
        path: scenario.path,
        token,
        concurrency,
        fetchImpl,
      });
      const measurement = await runLoadScenario({
        baseUrl,
        path: scenario.path,
        requests,
        concurrency,
        token,
        timeoutMs: 10_000,
        fetchImpl,
      });
      results.push({
        name: scenario.name,
        ...measurement,
      });
    }

    return {
      measuredAt: new Date().toISOString(),
      requestsPerScenario: requests,
      concurrency,
      thresholds: { maxP95Ms, maxFailureRate },
      passed: results.every((result) => (
        result.failureRate <= maxFailureRate
        && result.latencyMs.p95 <= maxP95Ms
      )),
      results,
    };
  } finally {
    if (sessionCreated) {
      await pool.query(
        'delete from public.wigofly_sessions where token_hash = $1',
        [tokenHash],
      ).catch(() => {});
    }
    if (ownsPool) await pool.end();
  }
}

async function loadTestMember(pool) {
  const result = await pool.query(
    `select
       u.id as user_id,
       (
         select member.conversation_id
         from public.wigofly_conversation_members member
         where member.user_id = u.id
           and not member.deleted
         order by member.updated_at desc
         limit 1
       ) as conversation_id
     from public.wigofly_users u
     where coalesce((u.data->>'emailVerified')::boolean, false)
       and coalesce(u.data->>'provider', '') <> 'deleted'
       and coalesce((u.data->>'isAdmin')::boolean, false) = false
     order by (
       exists (
         select 1
         from public.wigofly_conversation_members member
         where member.user_id = u.id
           and not member.deleted
       )
     ) desc, u.created_at
     limit 1`,
  );
  const row = result.rows[0];
  return row
    ? {
      userId: String(row.user_id),
      conversationId: row.conversation_id
        ? String(row.conversation_id)
        : null,
    }
    : null;
}

async function warmRoute({
  baseUrl,
  path,
  token,
  concurrency,
  fetchImpl,
}) {
  const responses = await Promise.all(
    Array.from({ length: concurrency }, () => fetchImpl(
      new URL(path, baseUrl),
      { headers: { Authorization: `Bearer ${token}` } },
    )),
  );
  await Promise.all(responses.map((response) => response.arrayBuffer()));
  const refused = responses.find((response) => !response.ok);
  if (refused) {
    throw new Error(`Prechauffage refuse pour ${path}: HTTP ${refused.status}`);
  }
}

async function main() {
  const report = await runAuthenticatedLoadTest({
    databaseUrl: process.env.DATABASE_URL,
    baseUrl: process.env.LOAD_TEST_URL || 'https://wigofly.vercel.app',
    requests: positiveInteger(process.env.LOAD_TEST_REQUESTS, 30),
    concurrency: positiveInteger(process.env.LOAD_TEST_CONCURRENCY, 5),
    maxP95Ms: positiveNumber(process.env.LOAD_TEST_MAX_P95_MS, 1_000),
    maxFailureRate: nonNegativeNumber(
      process.env.LOAD_TEST_MAX_FAILURE_RATE,
      0.01,
    ),
  });
  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) process.exitCode = 1;
}

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function nonNegativeNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  await main();
}
