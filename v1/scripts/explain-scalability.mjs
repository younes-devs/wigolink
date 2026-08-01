import pg from 'pg';
import { pathToFileURL } from 'node:url';
import { fixtureConfig } from './scalability-fixture.mjs';

const { Pool } = pg;

export function summarizePlan(planDocument) {
  const root = Array.isArray(planDocument)
    ? planDocument[0]
    : planDocument;
  const nodes = [];
  visit(root?.Plan, nodes);
  return {
    planningMs: Number(root?.['Planning Time'] || 0),
    executionMs: Number(root?.['Execution Time'] || 0),
    nodes: [...new Set(nodes.map((node) => node.type))],
    suspiciousScans: nodes
      .filter(
        (node) =>
          node.type === 'Seq Scan'
          && node.relation
          && node.estimatedRows >= 1_000,
      )
      .map((node) => ({
        relation: node.relation,
        estimatedRows: node.estimatedRows,
      })),
  };
}

export async function explainScalability({
  pool,
  runId,
  maxQueryMs = 250,
} = {}) {
  const scenarios = scalabilityScenarios({ runId });

  const results = [];
  for (const scenario of scenarios) {
    const response = await pool.query(
      `explain (analyze, buffers, format json) ${scenario.sql}`,
      scenario.params,
    );
    const summary = summarizePlan(response.rows[0]['QUERY PLAN']);
    results.push({
      name: scenario.name,
      ...summary,
      passesLatency: summary.executionMs <= maxQueryMs,
    });
  }
  return {
    runId,
    maxQueryMs,
    passed: results.every((result) => result.passesLatency),
    results,
  };
}

export function scalabilityScenarios({ runId, now = Date.now() }) {
  const userId = `${runId}-u-1`;
  const conversationId = `${runId}-c-1`;
  const today = new Date(now).toISOString().slice(0, 10);
  const cursorAt = now - 60 * 60 * 1000;
  const cursorTime = new Date(cursorAt).toISOString();
  return [
    {
      name: 'trips-feed',
      params: [today, userId],
      sql: `select t.id
        from public.wigofly_trips t
        join public.wigofly_users u
          on u.id = t.data->>'travelerId'
        where coalesce(t.data->>'status', 'published') = 'published'
          and coalesce(t.data->>'departureDate', t.data->>'date') >= $1
          and u.data->>'kycStatus' = 'verified'
          and t.data->>'travelerId' <> $2
        order by
          coalesce(t.data->>'departureDate', t.data->>'date') asc,
          t.created_at desc
        limit 50`,
    },
    {
      name: 'conversation-inbox',
      params: [userId],
      sql: `select c.id
        from public.wigofly_conversation_members member
        join public.wigofly_conversations c
          on c.id = member.conversation_id
        where member.user_id = $1
          and not member.deleted
        order by
          coalesce(
            (c.data->>'lastMessageAt')::bigint,
            extract(epoch from c.created_at) * 1000
          ) desc
        limit 50`,
    },
    {
      name: 'conversation-inbox-next',
      params: [userId, cursorAt, `${runId}-c-0`],
      sql: `select c.id
        from public.wigofly_conversation_members member
        join public.wigofly_conversations c
          on c.id = member.conversation_id
        where member.user_id = $1
          and not member.deleted
          and (
            coalesce(
              (c.data->>'lastMessageAt')::bigint,
              extract(epoch from c.created_at) * 1000
            ) < $2
            or (
              coalesce(
                (c.data->>'lastMessageAt')::bigint,
                extract(epoch from c.created_at) * 1000
              ) = $2 and c.id > $3
            )
          )
        order by
          coalesce(
            (c.data->>'lastMessageAt')::bigint,
            extract(epoch from c.created_at) * 1000
          ) desc,
          c.id asc
        limit 50`,
    },
    {
      name: 'message-page',
      params: [conversationId],
      sql: `select m.data
        from public.messages m
        where m.conversation_id = $1
          and coalesce(
            (m.data->>'hiddenForParticipants')::boolean,
            false
          ) = false
        order by m.at desc
        limit 51`,
    },
    {
      name: 'message-page-next',
      params: [conversationId, cursorTime],
      sql: `select m.data
        from public.messages m
        where m.conversation_id = $1
          and m.at < $2::timestamptz
          and coalesce(
            (m.data->>'hiddenForParticipants')::boolean,
            false
          ) = false
        order by m.at desc
        limit 51`,
    },
    {
      name: 'operations-member',
      params: [userId],
      sql: `select tx.id
        from public.wigofly_transactions tx
        where array[
          nullif(tx.data->>'senderId', ''),
          nullif(tx.data->>'travelerId', ''),
          nullif(tx.data->>'recipientId', '')
        ] @> array[$1]::text[]
        order by coalesce(
          nullif(tx.data->>'createdAt', '')::bigint,
          extract(epoch from tx.created_at) * 1000
        ) desc
        limit 51`,
    },
    {
      name: 'operations-member-next',
      params: [userId, cursorAt, `${runId}-tx-0`],
      sql: `select tx.id
        from public.wigofly_transactions tx
        where array[
          nullif(tx.data->>'senderId', ''),
          nullif(tx.data->>'travelerId', ''),
          nullif(tx.data->>'recipientId', '')
        ] @> array[$1]::text[]
          and (
            coalesce(
              nullif(tx.data->>'createdAt', '')::bigint,
              extract(epoch from tx.created_at) * 1000
            ) < $2
            or (
              coalesce(
                nullif(tx.data->>'createdAt', '')::bigint,
                extract(epoch from tx.created_at) * 1000
              ) = $2 and tx.id > $3
            )
          )
        order by coalesce(
          nullif(tx.data->>'createdAt', '')::bigint,
          extract(epoch from tx.created_at) * 1000
        ) desc, tx.id asc
        limit 51`,
    },
    {
      name: 'saved-trips-member-next',
      params: [userId, cursorTime, `${runId}-saved-0`],
      sql: `select saved.id
        from public.wigofly_saved_trips saved
        where saved.data->>'userId' = $1
          and (
            saved.created_at < $2::timestamptz
            or (saved.created_at = $2::timestamptz and saved.id > $3)
          )
        order by saved.created_at desc, saved.id asc
        limit 51`,
    },
    {
      name: 'audit-latest',
      params: [],
      sql: `select log.id, member.data
        from public.audit_logs log
        left join public.wigofly_users member on member.id = log.actor_id
        order by log.at desc
        limit 200`,
    },
  ];
}

function visit(node, output) {
  if (!node) return;
  output.push({
    type: node['Node Type'],
    relation: node['Relation Name'] || null,
    estimatedRows: Number(node['Plan Rows'] || 0),
  });
  for (const child of node.Plans || []) visit(child, output);
}

async function main() {
  const config = fixtureConfig();
  const maxQueryMs = Math.max(
    10,
    Math.min(
      5_000,
      Number(process.env.SCALABILITY_MAX_QUERY_MS) || 250,
    ),
  );
  const pool = new Pool({
    connectionString: config.connectionString,
    max: 1,
    ssl: config.ssl ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 5_000,
    allowExitOnIdle: true,
  });
  try {
    const report = await explainScalability({
      pool,
      runId: config.runId,
      maxQueryMs,
    });
    console.log(JSON.stringify(report, null, 2));
    if (!report.passed) process.exitCode = 1;
  } finally {
    await pool.end();
  }
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
