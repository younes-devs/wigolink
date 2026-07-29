import { auditChanges } from './services/audit.js';

const ACCOUNT_CONFIRMATION_KIND = 'account_confirmation';
const CLOSED_OPERATION_STATUSES = ['released', 'refunded', 'cancelled'];
const AUDITED_DELETION_FIELDS = ['name', 'email', 'phone', 'city', 'provider'];

export async function relationalAccountMessages({ pool, userId }) {
  const result = await pool.query(
    `select
       case
         when data = '{}'::jsonb then jsonb_build_object(
           'id', id,
           'txId', tx_id,
           'conversationId', conversation_id,
           'from', from_id,
           'text', text,
           'flagged', flagged,
           'at', extract(epoch from at) * 1000
         )
         else data
       end as message
     from public.messages
     where from_id = $1
     order by at desc`,
    [String(userId)],
  );
  return result.rows.map((row) => row.message);
}

export function createRelationalAccountDeletion({ getPool }) {
  return async function deleteRelationalAccount({ userId, code, now }) {
    const client = await getPool().connect();
    try {
      await client.query('begin');
      const confirmationResult = await client.query(
        `select data
         from public.wigofly_runtime_records
         where kind = $1 and id = $2
         for update`,
        [ACCOUNT_CONFIRMATION_KIND, String(userId).toLowerCase()],
      );
      const pending = confirmationResult.rows[0]?.data;
      if (
        !pending
        || pending.type !== 'delete_account'
        || Number(pending.expires) < now
      ) {
        await client.query('rollback');
        return {
          status: 400,
          error: 'Code de confirmation expire. Demandez-en un nouveau.',
        };
      }
      if (String(pending.code) !== code) {
        await client.query('rollback');
        return {
          status: 400,
          error: 'Code de confirmation incorrect',
        };
      }

      const operationResult = await client.query(
        `select count(*)::int as count
         from public.wigofly_transactions
         where (
           data->>'senderId' = $1
           or data->>'travelerId' = $1
           or data->>'recipientId' = $1
         )
           and coalesce(data->>'status', '') <> all($2::text[])`,
        [String(userId), CLOSED_OPERATION_STATUSES],
      );
      const activeTransactionCount = Number(
        operationResult.rows[0]?.count || 0,
      );
      if (activeTransactionCount > 0) {
        await client.query('rollback');
        return {
          status: 400,
          error: `Impossible : ${activeTransactionCount} transaction(s) encore en cours. Terminez-les d'abord.`,
        };
      }

      const userResult = await client.query(
        `select data
         from public.wigofly_users
         where id = $1
         for update`,
        [String(userId)],
      );
      const before = userResult.rows[0]?.data;
      if (!before) {
        await client.query('rollback');
        return { status: 404, error: 'Utilisateur introuvable.' };
      }
      const account = anonymizedAccount(before, { userId, now });
      await client.query(
        `update public.wigofly_users
         set data = $2::jsonb, updated_at = now()
         where id = $1`,
        [String(userId), JSON.stringify(account)],
      );
      await client.query(
        `delete from public.wigofly_runtime_records
         where kind = $1 and id = $2`,
        [ACCOUNT_CONFIRMATION_KIND, String(userId).toLowerCase()],
      );
      await client.query(
        `delete from public.wigofly_sessions where user_id = $1`,
        [String(userId)],
      );
      await client.query(
        `insert into public.audit_logs
           (actor_id, action, target_type, target_id, meta)
         values ($1, 'profile.delete', 'user', $1, $2::jsonb)`,
        [
          String(userId),
          JSON.stringify({
            recordEmpty: true,
            subjectUserId: String(userId),
            changes: auditChanges(
              before,
              account,
              AUDITED_DELETION_FIELDS,
            ),
          }),
        ],
      );
      await client.query('commit');
      return { account };
    } catch (error) {
      await client.query('rollback').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  };
}

function anonymizedAccount(user, { userId, now }) {
  return {
    ...user,
    name: 'Compte supprimé',
    email: `deleted-${userId}@wigofly.invalid`,
    phone: '',
    city: '',
    photoUrl: null,
    passwordHash: null,
    provider: 'deleted',
    deletedAt: now,
  };
}
