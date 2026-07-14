import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const MIGRATABLE_COLLECTIONS = ['auditLogs', 'notifications', 'messages'];

const DEFAULT_DATA_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data.json');

export function loadJsonData(dataFile = process.env.DATA_FILE || DEFAULT_DATA_FILE) {
  return JSON.parse(fs.readFileSync(dataFile, 'utf8'));
}

export function parseCollections(value = MIGRATABLE_COLLECTIONS.join(',')) {
  const collections = String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  const unknown = collections.filter((item) => !MIGRATABLE_COLLECTIONS.includes(item));
  if (unknown.length) {
    throw new Error(`Collections non migrables: ${unknown.join(', ')}`);
  }
  return [...new Set(collections)];
}

export function migrationPlan(data, collections = MIGRATABLE_COLLECTIONS) {
  return Object.fromEntries(
    collections.map((collection) => [collection, Array.isArray(data?.[collection]) ? data[collection].length : 0])
  );
}

export async function migrateJsonToPostgres({ data, pool, collections = MIGRATABLE_COLLECTIONS, dryRun = true }) {
  const selected = parseCollections(collections.join(','));
  const plan = migrationPlan(data, selected);
  const result = {
    dryRun,
    planned: plan,
    inserted: Object.fromEntries(selected.map((collection) => [collection, 0])),
    skipped: Object.fromEntries(selected.map((collection) => [collection, 0])),
  };

  if (dryRun) return result;
  if (!pool || typeof pool.query !== 'function') {
    throw new Error('Un pool Postgres est requis pour ecrire la migration.');
  }

  for (const collection of selected) {
    for (const item of data?.[collection] || []) {
      const inserted = await INSERT_BY_COLLECTION[collection](pool, item);
      result[inserted ? 'inserted' : 'skipped'][collection] += 1;
    }
  }

  return result;
}

async function insertMessage(pool, message) {
  const result = await pool.query(
    `insert into messages (id, tx_id, from_id, text, flagged, at)
     values ($1, $2, $3, $4, $5, to_timestamp($6 / 1000.0))
     on conflict (id) do nothing`,
    [
      message.id,
      message.txId,
      message.from,
      message.text,
      !!message.flagged,
      toMillis(message.at),
    ]
  );
  return (result.rowCount || 0) > 0;
}

async function insertNotification(pool, notification) {
  const result = await pool.query(
    `insert into notifications (id, user_id, tx_id, type, section, key, params, text, read, at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, to_timestamp($10 / 1000.0))
     on conflict (id) do nothing`,
    [
      notification.id,
      notification.userId,
      notification.txId || null,
      notification.type || 'transactions',
      notification.section || null,
      notification.key || null,
      JSON.stringify(notification.params || {}),
      notification.text || null,
      !!notification.read,
      toMillis(notification.at),
    ]
  );
  return (result.rowCount || 0) > 0;
}

async function insertAuditLog(pool, log) {
  const at = toMillis(log.at);
  const duplicate = await pool.query(
    `select 1
     from audit_logs
     where actor_id is not distinct from $1
       and action = $2
       and target_type is not distinct from $3
       and target_id is not distinct from $4
       and at = to_timestamp($5 / 1000.0)
     limit 1`,
    [log.actorId || null, log.action, log.targetType || null, log.targetId || null, at]
  );
  if (duplicate.rows?.length) return false;

  const result = await pool.query(
    `insert into audit_logs (actor_id, action, target_type, target_id, meta, at)
     values ($1, $2, $3, $4, $5, to_timestamp($6 / 1000.0))`,
    [
      log.actorId || null,
      log.action,
      log.targetType || null,
      log.targetId || null,
      JSON.stringify(log.meta || {}),
      at,
    ]
  );
  return (result.rowCount || 0) > 0;
}

function toMillis(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

const INSERT_BY_COLLECTION = {
  auditLogs: insertAuditLog,
  notifications: insertNotification,
  messages: insertMessage,
};
