import { relationalId } from './relational-id.js';

export function relationalSafetyAppealsEnabled(env = process.env) {
  return env.RELATIONAL_SAFETY_APPEALS === 'true';
}

export function createRelationalSafetyAppeals({ getPool }) {
  const pool = () => {
    const value = getPool();
    if (!value || typeof value.query !== 'function') {
      throw new Error('La base relationnelle est indisponible.');
    }
    return value;
  };

  return {
    async submit({ userId, reason, at }) {
      const id = relationalId('appeal');
      try {
        return await transaction(pool(), async (client) => {
          const existing = await client.query(
            `select data
             from public.wigolink_review_queue
             where data->>'type' = 'safety_appeal'
               and data->>'userId' = $1
               and data->>'status' = 'open'
             limit 1
             for update`,
            [String(userId)],
          );
          if (existing.rows[0]) {
            return { kind: 'duplicate', appeal: existing.rows[0].data };
          }
          const appeal = {
            id,
            type: 'safety_appeal',
            refId: id,
            userId,
            reason,
            status: 'open',
            createdAt: at,
          };
          await client.query(
            `insert into public.wigolink_review_queue
               (id, data, created_at, updated_at)
             values ($1, $2::jsonb, to_timestamp($3 / 1000.0), now())`,
            [id, JSON.stringify(appeal), at],
          );
          await appendAudit(client, {
            actorId: userId,
            action: 'user.safety.appeal',
            targetId: id,
            meta: {},
          });
          return { kind: 'ok', appeal };
        });
      } catch (error) {
        if (error?.code === '23505') return { kind: 'duplicate' };
        throw error;
      }
    },

    async review({ actorId, appealId, decision, reason, at }) {
      return transaction(pool(), async (client) => {
        const appealResult = await client.query(
          `select data
           from public.wigolink_review_queue
           where id = $1
             and data->>'type' = 'safety_appeal'
           for update`,
          [String(appealId)],
        );
        const appeal = appealResult.rows[0]?.data;
        if (!appeal || appeal.status !== 'open') {
          return { kind: 'not_found' };
        }

        appeal.status = decision === 'approve' ? 'accepted' : 'rejected';
        appeal.reviewedAt = at;
        appeal.reviewedBy = actorId;
        appeal.decisionReason = reason || null;
        const userResult = await client.query(
          `select data
           from public.wigolink_users
           where id = $1
           for update`,
          [String(appeal.userId)],
        );
        const user = userResult.rows[0]?.data || null;
        if (decision === 'approve' && user) {
          user.suspendedUntil = null;
          user.suspensionReason = null;
          user.messageSafetyBlockedUntil = null;
          await updateRecord(client, 'wigolink_users', user);
        }
        await updateRecord(client, 'wigolink_review_queue', appeal);
        await appendAudit(client, {
          actorId,
          action: `user.safety.appeal.${decision}`,
          targetId: appeal.id,
          meta: { userId: appeal.userId },
        });
        return { kind: 'ok', appeal };
      });
    },

    async safetyState({ currentTime, attemptCutoff }) {
      const [users, appeals] = await Promise.all([
        pool().query(
          `select data
           from public.wigolink_users member
           where not coalesce((data->>'isAdmin')::boolean, false)
             and nullif(data->>'deletedAt', '') is null
             and (
               coalesce((data->>'suspendedUntil')::bigint, 0) > $1
               or exists (
                 select 1
                 from jsonb_array_elements(
                   coalesce(data->'messageSafetyAttempts', '[]'::jsonb)
                 ) attempt
                 where coalesce((attempt->>'at')::bigint, 0) > $2
               )
             )
           order by
             (coalesce((data->>'suspendedUntil')::bigint, 0) > $1) desc,
             coalesce((data->>'suspendedUntil')::bigint, 0) desc
           limit 200`,
          [currentTime, attemptCutoff],
        ),
        pool().query(
          `select queue.data as appeal, member.data as member
           from public.wigolink_review_queue queue
           left join public.wigolink_users member
             on member.id = queue.data->>'userId'
           where queue.data->>'type' = 'safety_appeal'
           order by queue.created_at desc
           limit 500`,
        ),
      ]);
      return {
        users: users.rows.map((row) => row.data),
        appeals: appeals.rows.map((row) => ({
          ...row.appeal,
          user: row.member || null,
        })),
      };
    },
  };
}

async function transaction(pool, operation) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const result = await operation(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function updateRecord(client, table, value) {
  const result = await client.query(
    `update public.${table}
     set data = $2::jsonb, updated_at = now()
     where id = $1`,
    [String(value.id), JSON.stringify(value)],
  );
  if (!result.rowCount) throw new Error('Enregistrement introuvable.');
}

async function appendAudit(client, {
  actorId,
  action,
  targetId,
  meta,
}) {
  await client.query(
    `insert into public.audit_logs
       (actor_id, action, target_type, target_id, meta)
     values ($1, $2, 'safety_appeal', $3, $4::jsonb)`,
    [
      String(actorId),
      action,
      String(targetId),
      JSON.stringify(meta || {}),
    ],
  );
}
