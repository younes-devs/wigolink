import { pathToFileURL } from 'node:url';

export async function runLoadScenario({
  baseUrl,
  path = '/api/health',
  requests = 100,
  concurrency = 10,
  token = '',
  method = 'GET',
  body = null,
  headers = {},
  acceptedStatuses = [],
  timeoutMs = 10_000,
  fetchImpl = fetch,
}) {
  const target = new URL(path, baseUrl).toString();
  const results = [];
  let cursor = 0;

  async function worker() {
    while (cursor < requests) {
      cursor += 1;
      const startedAt = performance.now();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(target, {
          method,
          headers: {
            ...(body ? { 'Content-Type': 'application/json' } : {}),
            ...headers,
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body,
          signal: controller.signal,
        });
        await response.arrayBuffer();
        results.push({
          ok: response.ok || acceptedStatuses.includes(response.status),
          status: response.status,
          durationMs: performance.now() - startedAt,
        });
      } catch (error) {
        results.push({
          ok: false,
          status: 0,
          durationMs: performance.now() - startedAt,
          error: error?.name || 'Error',
        });
      } finally {
        clearTimeout(timeout);
      }
    }
  }

  const startedAt = performance.now();
  await Promise.all(Array.from(
    { length: Math.max(1, Math.min(concurrency, requests)) },
    () => worker(),
  ));
  const elapsedMs = performance.now() - startedAt;
  const durations = results.map((result) => result.durationMs).sort((a, b) => a - b);
  const failures = results.filter((result) => !result.ok);
  return {
    target,
    requests: results.length,
    concurrency,
    elapsedMs: round(elapsedMs),
    requestsPerSecond: round(results.length / Math.max(elapsedMs / 1_000, 0.001)),
    failures: failures.length,
    failureRate: round(failures.length / Math.max(results.length, 1)),
    latencyMs: {
      p50: round(percentile(durations, 0.5)),
      p95: round(percentile(durations, 0.95)),
      p99: round(percentile(durations, 0.99)),
      max: round(durations.at(-1) || 0),
    },
    statuses: Object.fromEntries(
      [...new Set(results.map((result) => result.status))]
        .sort((a, b) => a - b)
        .map((status) => [status, results.filter((result) => result.status === status).length]),
    ),
  };
}

function percentile(sorted, ratio) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)];
}

function round(value) {
  return Math.round(value * 100) / 100;
}

async function main() {
  const baseUrl = process.env.LOAD_TEST_URL || 'http://127.0.0.1:4517';
  const result = await runLoadScenario({
    baseUrl,
    path: process.env.LOAD_TEST_PATH || '/api/health',
    requests: positiveInteger(process.env.LOAD_TEST_REQUESTS, 100),
    concurrency: positiveInteger(process.env.LOAD_TEST_CONCURRENCY, 10),
    token: process.env.LOAD_TEST_TOKEN || '',
    method: String(process.env.LOAD_TEST_METHOD || 'GET').toUpperCase(),
    body: process.env.LOAD_TEST_BODY || null,
    acceptedStatuses: commaSeparatedIntegers(process.env.LOAD_TEST_ACCEPTED_STATUSES),
    timeoutMs: positiveInteger(process.env.LOAD_TEST_TIMEOUT_MS, 10_000),
  });
  console.log(JSON.stringify(result, null, 2));
  const maxFailureRate = Number(process.env.LOAD_TEST_MAX_FAILURE_RATE || 0);
  const maxP95 = Number(process.env.LOAD_TEST_MAX_P95_MS || 2_000);
  if (result.failureRate > maxFailureRate || result.latencyMs.p95 > maxP95) {
    process.exitCode = 1;
  }
}

function commaSeparatedIntegers(value) {
  return String(value || '')
    .split(',')
    .map((item) => Number.parseInt(item.trim(), 10))
    .filter(Number.isFinite);
}

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  await main();
}
