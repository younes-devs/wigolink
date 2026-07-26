const REQUIRED_TABLES = [
  'wigofly_app_state',
  'wigofly_users',
  'wigofly_trips',
  'wigofly_listings',
  'wigofly_transactions',
  'wigofly_matching_offers',
  'wigofly_saved_trips',
  'wigofly_conversations',
  'wigofly_disputes',
  'wigofly_review_queue',
  'wigofly_kyc_submissions',
  'wigofly_kyc_decisions',
  'wigofly_custom_whitelist',
  'wigofly_runtime_records',
  'wigofly_sessions',
  'messages',
  'notifications',
  'audit_logs',
];

const COLLECTION_TABLES = [
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
  ['messages', 'messages'],
  ['notifications', 'notifications'],
];

export async function verifyRelationalState(pool) {
  if (!pool || typeof pool.query !== 'function') {
    throw new Error('Un pool Postgres est requis pour verifier la migration.');
  }

  const tablesResult = await pool.query(
    `select name, to_regclass('public.' || name) is not null as present
     from unnest($1::text[]) as name`,
    [REQUIRED_TABLES],
  );
  const missingTables = tablesResult.rows
    .filter((row) => !row.present)
    .map((row) => row.name);
  if (missingTables.length) {
    return { ready: false, missingTables, collections: [], orphanMessages: null };
  }

  const stateResult = await pool.query('select state from public.wigofly_app_state where id = 1');
  const state = stateResult.rows[0]?.state || {};
  const collections = [];
  for (const [collection, table] of COLLECTION_TABLES) {
    const countResult = await pool.query(`select count(*)::int as count from public.${table}`);
    const actual = Number(countResult.rows[0]?.count || 0);
    const source = Array.isArray(state[collection]) ? state[collection].length : 0;
    collections.push({
      collection,
      table,
      source,
      actual,
      complete: actual >= source,
    });
  }

  const orphanResult = await pool.query(
    `select count(*)::int as count
     from public.messages message
     left join public.wigofly_conversations conversation
       on conversation.id = message.conversation_id
     where message.conversation_id is not null and conversation.id is null`,
  );
  const orphanMessages = Number(orphanResult.rows[0]?.count || 0);
  return {
    ready: collections.every((item) => item.complete) && orphanMessages === 0,
    missingTables: [],
    collections,
    orphanMessages,
  };
}

export { REQUIRED_TABLES };
