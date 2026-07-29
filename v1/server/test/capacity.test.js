import assert from 'node:assert/strict';
import test from 'node:test';
import {
  capacityConfig,
  createCapacityService,
} from '../services/capacity.js';

function fakePool({
  databaseBytes = 100,
  activeConnections = 3,
  tables = [],
  pool = {},
} = {}) {
  let query = 0;
  return {
    options: { max: 5 },
    totalCount: 3,
    idleCount: 2,
    waitingCount: 0,
    ...pool,
    async query() {
      query += 1;
      return query === 1
        ? {
            rows: [{
              database_bytes: String(databaseBytes),
              active_connections: String(activeConnections),
            }],
          }
        : { rows: tables };
    },
  };
}

test('capacityConfig borne les seuils et conserve des valeurs exploitables', () => {
  assert.deepEqual(capacityConfig({
    DB_CAPACITY_BYTES: '1000',
    DB_CONNECTION_BUDGET: '20',
    DB_CAPACITY_WARNING_RATIO: '0.6',
    DB_CAPACITY_CRITICAL_RATIO: '2',
    DB_DEAD_ROW_WARNING_RATIO: '0.1',
  }), {
    databaseCapacityBytes: 1000,
    connectionBudget: 20,
    warningRatio: 0.6,
    criticalRatio: 0.85,
    deadRowRatio: 0.1,
  });
});

test('capacity retourne un resume sain sans donnees personnelles', async () => {
  const service = createCapacityService({
    getPool: () => fakePool({
      databaseBytes: 250,
      activeConnections: 3,
      tables: [{
        table_name: 'messages',
        estimated_rows: '900',
        dead_rows: '10',
        total_bytes: '2048',
        last_vacuum_at: null,
        last_analyze_at: new Date('2026-07-29T10:00:00.000Z'),
      }],
    }),
    config: {
      databaseCapacityBytes: 1000,
      connectionBudget: 20,
      warningRatio: 0.7,
      criticalRatio: 0.85,
      deadRowRatio: 0.2,
    },
    now: () => new Date('2026-07-29T12:00:00.000Z'),
  });

  const result = await service.snapshot();
  assert.equal(result.status, 'healthy');
  assert.equal(result.database.usageRatio, 0.25);
  assert.equal(result.connections.pool.max, 5);
  assert.deepEqual(result.tables[0], {
    name: 'messages',
    estimatedRows: 900,
    deadRows: 10,
    deadRowRatio: 0.011,
    totalBytes: 2048,
    lastVacuumAt: null,
    lastAnalyzeAt: '2026-07-29T10:00:00.000Z',
  });
  assert.deepEqual(result.warnings, []);
});

test('capacity detecte la saturation et les lignes mortes', async () => {
  const service = createCapacityService({
    getPool: () => fakePool({
      databaseBytes: 900,
      activeConnections: 18,
      pool: { waitingCount: 2 },
      tables: [{
        table_name: 'messages',
        estimated_rows: '800',
        dead_rows: '300',
        total_bytes: '4096',
      }],
    }),
    config: {
      databaseCapacityBytes: 1000,
      connectionBudget: 20,
      warningRatio: 0.7,
      criticalRatio: 0.85,
      deadRowRatio: 0.2,
    },
  });

  const result = await service.snapshot();
  assert.equal(result.status, 'critical');
  assert.deepEqual(result.warnings.map((warning) => warning.code), [
    'database_capacity_critical',
    'database_connections_critical',
    'database_pool_waiting',
    'table_dead_rows_high',
  ]);
});

