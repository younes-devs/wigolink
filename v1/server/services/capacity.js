const MEBIBYTE = 1024 * 1024;
const DEFAULT_DATABASE_CAPACITY_BYTES = 500 * MEBIBYTE;
const DEFAULT_CONNECTION_BUDGET = 60;
const DEFAULT_WARNING_RATIO = 0.7;
const DEFAULT_CRITICAL_RATIO = 0.85;
const DEFAULT_DEAD_ROW_RATIO = 0.2;
const MINIMUM_ROWS_FOR_DEAD_ROW_ALERT = 1_000;

const MONITORED_TABLES = [
  'wigolink_users',
  'wigolink_trips',
  'wigolink_listings',
  'wigolink_transactions',
  'wigolink_matching_offers',
  'wigolink_saved_trips',
  'wigolink_conversations',
  'wigolink_conversation_members',
  'wigolink_conversation_reports',
  'messages',
  'notifications',
  'audit_logs',
  'wigolink_kyc_submissions',
  'wigolink_kyc_decisions',
  'wigolink_runtime_records',
  'wigolink_sessions',
  'wigolink_app_state',
];

export function capacityConfig(env = process.env) {
  return {
    databaseCapacityBytes: positiveInteger(
      env.DB_CAPACITY_BYTES,
      DEFAULT_DATABASE_CAPACITY_BYTES,
    ),
    connectionBudget: positiveInteger(
      env.DB_CONNECTION_BUDGET,
      DEFAULT_CONNECTION_BUDGET,
    ),
    warningRatio: boundedRatio(env.DB_CAPACITY_WARNING_RATIO, DEFAULT_WARNING_RATIO),
    criticalRatio: boundedRatio(env.DB_CAPACITY_CRITICAL_RATIO, DEFAULT_CRITICAL_RATIO),
    deadRowRatio: boundedRatio(env.DB_DEAD_ROW_WARNING_RATIO, DEFAULT_DEAD_ROW_RATIO),
  };
}

export function createCapacityService({
  getPool,
  config = capacityConfig(),
  now = () => new Date(),
} = {}) {
  async function snapshot() {
    const pool = getPool?.();
    if (!pool || typeof pool.query !== 'function') {
      throw new Error('Base de donnees indisponible');
    }

    const [databaseResult, tableResult] = await Promise.all([
      pool.query(
        `select
           pg_database_size(current_database())::bigint as database_bytes,
           coalesce((
             select numbackends
             from pg_stat_database
             where datname = current_database()
           ), 0)::int as active_connections`,
      ),
      pool.query(
        `select
           relname as table_name,
           n_live_tup::bigint as estimated_rows,
           n_dead_tup::bigint as dead_rows,
           pg_total_relation_size(
             quote_ident(schemaname) || '.' || quote_ident(relname)
           )::bigint as total_bytes,
           coalesce(last_autovacuum, last_vacuum) as last_vacuum_at,
           coalesce(last_autoanalyze, last_analyze) as last_analyze_at
         from pg_stat_user_tables
         where schemaname = 'public'
           and relname = any($1::text[])
         order by total_bytes desc`,
        [MONITORED_TABLES],
      ),
    ]);

    const databaseBytes = integer(databaseResult.rows[0]?.database_bytes);
    const activeConnections = integer(databaseResult.rows[0]?.active_connections);
    const tables = tableResult.rows.map(normalizeTable);
    const poolState = {
      max: integer(pool.options?.max),
      total: integer(pool.totalCount),
      idle: integer(pool.idleCount),
      waiting: integer(pool.waitingCount),
    };
    const warnings = capacityWarnings({
      databaseBytes,
      activeConnections,
      tables,
      poolState,
      config,
    });

    return {
      measuredAt: now().toISOString(),
      status: warnings.some((warning) => warning.level === 'critical')
        ? 'critical'
        : warnings.length
          ? 'warning'
          : 'healthy',
      database: {
        bytes: databaseBytes,
        capacityBytes: config.databaseCapacityBytes,
        usageRatio: ratio(databaseBytes, config.databaseCapacityBytes),
      },
      connections: {
        active: activeConnections,
        budget: config.connectionBudget,
        usageRatio: ratio(activeConnections, config.connectionBudget),
        pool: poolState,
      },
      tables,
      warnings,
    };
  }

  return { snapshot };
}

function normalizeTable(row) {
  const estimatedRows = integer(row.estimated_rows);
  const deadRows = integer(row.dead_rows);
  return {
    name: String(row.table_name || ''),
    estimatedRows,
    deadRows,
    deadRowRatio: ratio(deadRows, estimatedRows + deadRows),
    totalBytes: integer(row.total_bytes),
    lastVacuumAt: isoOrNull(row.last_vacuum_at),
    lastAnalyzeAt: isoOrNull(row.last_analyze_at),
  };
}

function capacityWarnings({
  databaseBytes,
  activeConnections,
  tables,
  poolState,
  config,
}) {
  const warnings = [];
  const databaseRatio = ratio(databaseBytes, config.databaseCapacityBytes);
  if (databaseRatio >= config.criticalRatio) {
    warnings.push({
      level: 'critical',
      code: 'database_capacity_critical',
      value: databaseRatio,
    });
  } else if (databaseRatio >= config.warningRatio) {
    warnings.push({
      level: 'warning',
      code: 'database_capacity_warning',
      value: databaseRatio,
    });
  }

  const connectionRatio = ratio(activeConnections, config.connectionBudget);
  if (connectionRatio >= config.criticalRatio) {
    warnings.push({
      level: 'critical',
      code: 'database_connections_critical',
      value: connectionRatio,
    });
  } else if (connectionRatio >= config.warningRatio) {
    warnings.push({
      level: 'warning',
      code: 'database_connections_warning',
      value: connectionRatio,
    });
  }

  if (poolState.waiting > 0) {
    warnings.push({
      level: 'critical',
      code: 'database_pool_waiting',
      value: poolState.waiting,
    });
  }

  for (const table of tables) {
    if (
      table.estimatedRows + table.deadRows >= MINIMUM_ROWS_FOR_DEAD_ROW_ALERT
      && table.deadRowRatio >= config.deadRowRatio
    ) {
      warnings.push({
        level: 'warning',
        code: 'table_dead_rows_high',
        table: table.name,
        value: table.deadRowRatio,
      });
    }
  }
  return warnings;
}

function integer(value) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) ? number : 0;
}

function positiveInteger(value, fallback) {
  const number = integer(value);
  return number > 0 ? number : fallback;
}

function boundedRatio(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 && number < 1
    ? number
    : fallback;
}

function ratio(value, total) {
  if (!total) return 0;
  return Number((value / total).toFixed(4));
}

function isoOrNull(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
