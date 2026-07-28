const ARRAY_COLLECTIONS = [
  ['users', 'wigofly_users'],
  ['trips', 'wigofly_trips'],
  ['listings', 'wigofly_listings'],
  ['transactions', 'wigofly_transactions'],
  ['matchingOffers', 'wigofly_matching_offers'],
  ['savedTrips', 'wigofly_saved_trips'],
  ['conversations', 'wigofly_conversations'],
  ['disputes', 'wigofly_disputes'],
  ['reviewQueue', 'wigofly_review_queue'],
  ['kycSubmissions', 'wigofly_kyc_submissions'],
  ['kycDecisions', 'wigofly_kyc_decisions'],
  ['customWhitelist', 'wigofly_custom_whitelist'],
];

const MAP_COLLECTIONS = [
  ['otps', 'otp'],
  ['resets', 'password_reset'],
  ['pendingVerifications', 'email_verification'],
];

export function relationalMigrationPlan(state = {}) {
  return {
    arrays: ARRAY_COLLECTIONS.map(([collection, table]) => ({
      collection,
      table,
      count: Array.isArray(state[collection]) ? state[collection].length : 0,
    })),
    maps: MAP_COLLECTIONS.map(([collection, kind]) => ({
      collection,
      kind,
      count: state[collection] && typeof state[collection] === 'object' ? Object.keys(state[collection]).length : 0,
    })),
    messages: Array.isArray(state.messages) ? state.messages.length : 0,
    notifications: Array.isArray(state.notifications) ? state.notifications.length : 0,
  };
}

export async function migrateStateToRelational({ state, pool, dryRun = true }) {
  const plan = relationalMigrationPlan(state);
  if (dryRun) return { dryRun: true, ...plan };
  if (!pool || typeof pool.query !== 'function') throw new Error('Un pool Postgres est requis pour ecrire la migration.');

  const inserted = {};
  for (const [collection, table] of ARRAY_COLLECTIONS) {
    const rows = Array.isArray(state[collection]) ? state[collection] : [];
    inserted[collection] = 0;
    for (const row of rows) {
      const id = String(row?.id || `${collection}-${inserted[collection]}`);
      await pool.query(
        `insert into public.${table} (id, data, created_at, updated_at)
         values ($1, $2::jsonb, coalesce(to_timestamp($3 / 1000.0), now()), now())
         on conflict (id) do update set data = excluded.data, updated_at = now()`,
        [id, JSON.stringify(row || {}), timestampFor(row)]
      );
      inserted[collection] += 1;
    }
  }

  inserted.runtime = 0;
  for (const [collection, kind] of MAP_COLLECTIONS) {
    const values = state[collection] && typeof state[collection] === 'object' ? state[collection] : {};
    for (const [id, value] of Object.entries(values)) {
      await pool.query(
        `insert into public.wigofly_runtime_records (kind, id, data, expires_at, updated_at)
         values ($1, $2, $3::jsonb, $4, now())
         on conflict (kind, id) do update set data = excluded.data, expires_at = excluded.expires_at, updated_at = now()`,
        [kind, String(id), JSON.stringify(value || {}), expiryFor(value)]
      );
      inserted.runtime += 1;
    }
  }

  inserted.messages = 0;
  for (const message of Array.isArray(state.messages) ? state.messages : []) {
    if (!message?.id) continue;
    await pool.query(
      `insert into public.messages (id, tx_id, conversation_id, from_id, client_id, text, flagged, at, data)
       values ($1, $2, $3, $4, $5, $6, $7, to_timestamp($8 / 1000.0), $9::jsonb)
       on conflict (id) do update set tx_id = excluded.tx_id, conversation_id = excluded.conversation_id,
         from_id = excluded.from_id, client_id = excluded.client_id, text = excluded.text,
         flagged = excluded.flagged, at = excluded.at, data = excluded.data`,
      [message.id, message.txId || null, message.conversationId || null, message.from || null,
        message.clientId || null, message.text || '', !!message.flagged, timestampFor(message), JSON.stringify(message)]
    );
    inserted.messages += 1;
  }

  inserted.notifications = 0;
  for (const notification of Array.isArray(state.notifications) ? state.notifications : []) {
    if (!notification?.id) continue;
    await pool.query(
      `insert into public.notifications (id, user_id, tx_id, type, section, key, params, text, read, at)
       values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, to_timestamp($10 / 1000.0))
       on conflict (id) do nothing`,
      [notification.id, notification.userId, notification.txId || null, notification.type || 'transactions', notification.section || null,
        notification.key || null, JSON.stringify(notification.params || {}), notification.text || null, !!notification.read, timestampFor(notification)]
    );
    inserted.notifications += 1;
  }

  return { dryRun: false, ...plan, inserted };
}

function timestampFor(row) {
  const value = Number(row?.updatedAt || row?.createdAt || row?.at || Date.now());
  return Number.isFinite(value) ? value : Date.now();
}

function expiryFor(value) {
  const raw = Number(value?.expiresAt || value?.expires_at || 0);
  return Number.isFinite(raw) && raw > 0 ? new Date(raw) : null;
}
