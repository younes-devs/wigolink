import { createMessageMediaService } from './services/message-media.js';
import { migrateInlineMessageMedia } from './migrate-message-media.js';
import { createPostgresPool } from './postgres-repositories.js';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL est requis.');
if (!process.env.SUPABASE_URL) throw new Error('SUPABASE_URL est requis.');
const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!secretKey) throw new Error('SUPABASE_SECRET_KEY est requis.');

const pool = createPostgresPool({ connectionString: process.env.DATABASE_URL });
const messageMedia = createMessageMediaService({
  url: process.env.SUPABASE_URL,
  secretKey,
  bucket: process.env.SUPABASE_MESSAGE_MEDIA_BUCKET,
});

try {
  await pool.query('begin');
  const result = await pool.query(
    'select state, revision from public.wigolink_app_state where id = 1 for update',
  );
  const state = result.rows[0]?.state;
  if (!state) throw new Error('Etat Wigolink introuvable.');
  const migrated = await migrateInlineMessageMedia({ state, messageMedia });
  await pool.query(
    `update public.wigolink_app_state
     set state = $1::jsonb, revision = revision + 1, updated_at = now()
     where id = 1`,
    [JSON.stringify(migrated.state)],
  );
  for (const message of migrated.state.messages || []) {
    if (!message?.id) continue;
    await pool.query(
      `update public.messages set data = $2::jsonb where id = $1`,
      [message.id, JSON.stringify(message)],
    );
  }
  await pool.query('commit');
  console.log(JSON.stringify({ migrated: migrated.migrated, skipped: migrated.skipped }, null, 2));
} catch (error) {
  await pool.query('rollback').catch(() => {});
  throw error;
} finally {
  await pool.end();
}
