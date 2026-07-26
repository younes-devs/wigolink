const DEFAULT_SLOW_REQUEST_MS = 1_000;
const DEFAULT_SAMPLE_SIZE = 500;

export function createObservability({
  enabled = true,
  release = 'local',
  environment = 'development',
  slowRequestMs = DEFAULT_SLOW_REQUEST_MS,
  sampleSize = DEFAULT_SAMPLE_SIZE,
  logger = console,
  now = () => Date.now(),
} = {}) {
  const samples = [];
  const startedAt = now();

  function write(level, event, fields = {}) {
    if (!enabled) return;
    const method = typeof logger[level] === 'function' ? level : 'log';
    logger[method](JSON.stringify({
      level,
      event,
      release,
      environment,
      at: new Date(now()).toISOString(),
      ...fields,
    }));
  }

  function middleware(req, res, next) {
    const start = now();
    res.once('finish', () => {
      const durationMs = Math.max(0, now() - start);
      const record = {
        method: req.method,
        route: normalizedRoute(req),
        status: res.statusCode,
        durationMs,
        requestId: req.requestId || String(res.getHeader?.('X-Request-Id') || ''),
      };
      samples.push(record);
      if (samples.length > sampleSize) samples.splice(0, samples.length - sampleSize);

      if (record.status >= 500) write('error', 'http_request_failed', record);
      else if (durationMs >= slowRequestMs) write('warn', 'http_request_slow', record);
      else if (process.env.OBSERVABILITY_LOG_ALL === 'true') write('info', 'http_request', record);
    });
    next();
  }

  function errorMiddleware(error, req, res, next) {
    write('error', 'unhandled_request_error', {
      method: req.method,
      route: normalizedRoute(req),
      requestId: req.requestId || '',
      name: error?.name || 'Error',
      message: String(error?.message || 'Unexpected error').slice(0, 500),
    });
    if (res.headersSent) return next(error);
    return res.status(500).json({
      error: 'Erreur interne',
      requestId: req.requestId || undefined,
    });
  }

  function snapshot() {
    const durations = samples.map((sample) => sample.durationMs).sort((a, b) => a - b);
    const failures = samples.filter((sample) => sample.status >= 500);
    return {
      release,
      environment,
      uptimeMs: Math.max(0, now() - startedAt),
      sampleSize: samples.length,
      failures: failures.length,
      failureRate: samples.length ? failures.length / samples.length : 0,
      latencyMs: {
        p50: percentile(durations, 0.5),
        p95: percentile(durations, 0.95),
        max: durations.at(-1) || 0,
      },
      slowRequests: samples.filter((sample) => sample.durationMs >= slowRequestMs).length,
    };
  }

  return { middleware, errorMiddleware, snapshot, write };
}

function normalizedRoute(req) {
  const routePath = req.route?.path;
  if (routePath) return `${req.baseUrl || ''}${routePath}`;
  return String(req.path || req.originalUrl || '/').split('?')[0];
}

function percentile(sorted, ratio) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)];
}
