const REQUIRED_TABLES = [
  'wigolink_app_state',
  'wigolink_users',
  'wigolink_trips',
  'wigolink_listings',
  'wigolink_transactions',
  'wigolink_matching_offers',
  'wigolink_saved_trips',
  'wigolink_conversations',
  'wigolink_conversation_members',
  'wigolink_conversation_reports',
  'wigolink_disputes',
  'wigolink_review_queue',
  'wigolink_kyc_submissions',
  'wigolink_kyc_decisions',
  'wigolink_custom_whitelist',
  'wigolink_runtime_records',
  'wigolink_sessions',
  'messages',
  'notifications',
  'audit_logs',
];

const COLLECTION_TABLES = [
  ['users', 'wigolink_users'],
  ['trips', 'wigolink_trips'],
  ['listings', 'wigolink_listings'],
  ['transactions', 'wigolink_transactions'],
  ['matchingOffers', 'wigolink_matching_offers'],
  ['savedTrips', 'wigolink_saved_trips'],
  ['conversations', 'wigolink_conversations'],
  ['disputes', 'wigolink_disputes'],
  ['reviewQueue', 'wigolink_review_queue'],
  ['kycSubmissions', 'wigolink_kyc_submissions'],
  ['kycDecisions', 'wigolink_kyc_decisions'],
  ['customWhitelist', 'wigolink_custom_whitelist'],
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

  const stateResult = await pool.query('select state from public.wigolink_app_state where id = 1');
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
     left join public.wigolink_conversations conversation
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
