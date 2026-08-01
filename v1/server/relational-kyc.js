import { relationalId } from './relational-id.js';

const STATUS_BY_FILTER = {
  pending: 'pending',
  verified: 'approved',
  rejected: 'rejected',
  refused: 'refused',
};

export function relationalKycEnabled(env = process.env) {
  return env.RELATIONAL_KYC === 'true';
}

export function createRelationalKycRepository({ getPool }) {
  const pool = () => {
    const value = getPool();
    if (!value || typeof value.query !== 'function') {
      throw new Error('La base relationnelle est indisponible.');
    }
    return value;
  };

  return {
    async listForUser(userId) {
      const result = await pool().query(
        `select id, data
         from public.wigofly_kyc_submissions
         where data->>'userId' = $1
         order by coalesce((data->>'submittedAt')::bigint, 0) desc`,
        [String(userId)],
      );
      return result.rows.map(hydrate);
    },

    async rejectedCountForUser(userId, { before = Infinity } = {}) {
      const beforeValue = Number.isFinite(Number(before))
        ? Number(before)
        : Number.MAX_SAFE_INTEGER;
      const result = await pool().query(
        `select count(*)::int as count
         from public.wigofly_kyc_submissions
         where data->>'userId' = $1
           and data->>'status' = 'rejected'
           and coalesce((data->>'submittedAt')::bigint, 0) < $2`,
        [String(userId), beforeValue],
      );
      return Number(result.rows[0]?.count || 0);
    },

    async appendSubmission(data) {
      const submission = newSubmission(data);
      await pool().query(
        `insert into public.wigofly_kyc_submissions
           (id, data, created_at, updated_at)
         values ($1, $2::jsonb, to_timestamp($3 / 1000.0), now())`,
        [
          submission.id,
          JSON.stringify(submission),
          submission.submittedAt,
        ],
      );
      return submission;
    },

    async submitForUser(data, user) {
      const submission = newSubmission(data);
      const client = await pool().connect();
      try {
        await client.query('begin');
        await client.query(
          `insert into public.wigofly_kyc_submissions
             (id, data, created_at, updated_at)
           values ($1, $2::jsonb, to_timestamp($3 / 1000.0), now())`,
          [
            submission.id,
            JSON.stringify(submission),
            submission.submittedAt,
          ],
        );
        const updated = await client.query(
          `update public.wigofly_users
           set data = data || jsonb_build_object('kycStatus', $2::text),
               updated_at = now()
           where id = $1`,
          [String(user.id), String(user.kycStatus || 'pending')],
        );
        if (!updated.rowCount) throw new Error('Utilisateur introuvable.');
        await client.query('commit');
        return submission;
      } catch (error) {
        await client.query('rollback');
        throw error;
      } finally {
        client.release();
      }
    },

    async updateSubmission(submission, { client = null } = {}) {
      const executor = client || pool();
      const result = await executor.query(
        `update public.wigofly_kyc_submissions
         set data = $2::jsonb, updated_at = now()
         where id = $1
         returning data`,
        [String(submission.id), JSON.stringify(submission)],
      );
      if (!result.rowCount) throw new Error('Demande KYC introuvable.');
      return result.rows[0].data;
    },

    async purgeSensitiveForUser(userId) {
      const result = await pool().query(
        `update public.wigofly_kyc_submissions
         set data = jsonb_set(
           jsonb_set(
             jsonb_set(
               jsonb_set(data, '{selfiePhoto}', 'null'::jsonb),
               '{idFrontPhoto}', 'null'::jsonb
             ),
             '{idBackPhoto}', 'null'::jsonb
           ),
           '{legalName}', to_jsonb('(supprime)'::text)
         ),
         updated_at = now()
         where data->>'userId' = $1`,
        [String(userId)],
      );
      return result.rowCount || 0;
    },

    async pending() {
      return this.list({ filter: 'pending' });
    },

    async reviewed() {
      const result = await pool().query(
        `select id, data
         from public.wigofly_kyc_submissions
         where nullif(data->>'reviewedAt', '') is not null
         order by coalesce((data->>'reviewedAt')::bigint, 0) desc
         limit 500`,
      );
      return result.rows.map(hydrate);
    },

    async stats({ now = Date.now(), slaMs = 0 } = {}) {
      const overdueBefore = Number(now) - Math.max(0, Number(slaMs) || 0);
      const result = await pool().query(
        `select
           count(*) filter (
             where data->>'status' = 'pending'
           )::int as pending,
           count(*) filter (
             where data->>'status' = 'pending'
               and coalesce((data->>'submittedAt')::bigint, 0) < $1
           )::int as overdue,
           avg(
             case
               when nullif(data->>'reviewedAt', '') is not null
               then (data->>'reviewedAt')::bigint
                  - (data->>'submittedAt')::bigint
             end
           ) as avg_review_ms
         from public.wigofly_kyc_submissions`,
        [overdueBefore],
      );
      const row = result.rows[0] || {};
      return {
        pending: Number(row.pending || 0),
        overdue: Number(row.overdue || 0),
        avgReviewMs: row.avg_review_ms === null
          || row.avg_review_ms === undefined
          ? null
          : Number(row.avg_review_ms),
      };
    },

    async list({ filter = 'pending', q = '' } = {}) {
      const status = filter === 'all' ? null : STATUS_BY_FILTER[filter] || 'pending';
      const needle = String(q || '').trim().toLowerCase();
      const result = await pool().query(
        `select submission.id,
                submission.data
                  - 'selfiePhoto'
                  - 'idFrontPhoto'
                  - 'idBackPhoto' as data
         from public.wigofly_kyc_submissions submission
         left join public.wigofly_users member
           on member.id = submission.data->>'userId'
         where ($1::text is null or submission.data->>'status' = $1)
           and (
             $2 = ''
             or lower(coalesce(submission.data->>'legalName', '')) like '%' || $2 || '%'
             or lower(coalesce(member.data->>'email', '')) like '%' || $2 || '%'
           )
         order by
           case when $1 = 'pending'
             then coalesce((submission.data->>'submittedAt')::bigint, 0)
           end asc,
           case when $1 is distinct from 'pending'
             then coalesce((submission.data->>'submittedAt')::bigint, 0)
           end desc
         limit 200`,
        [status, needle],
      );
      return result.rows.map(hydrate);
    },

    async findSubmission(id) {
      const result = await pool().query(
        `select id, data
         from public.wigofly_kyc_submissions
         where id = $1
         limit 1`,
        [String(id)],
      );
      return result.rows[0] ? hydrate(result.rows[0]) : null;
    },

    async historyForUser(userId) {
      const result = await pool().query(
        `select id, data
         from public.wigofly_kyc_decisions
         where data->>'userId' = $1
         order by coalesce((data->>'at')::bigint, 0) desc
         limit 100`,
        [String(userId)],
      );
      return result.rows.map(hydrate);
    },

    async appendDecision({
      submissionId,
      userId,
      adminId,
      decision,
      reason,
      at = Date.now(),
    }, { client = null } = {}) {
      const record = {
        id: relationalId('kycd'),
        submissionId,
        userId,
        adminId,
        decision,
        reason,
        at,
      };
      const executor = client || pool();
      await executor.query(
        `insert into public.wigofly_kyc_decisions
           (id, data, created_at, updated_at)
         values ($1, $2::jsonb, to_timestamp($3 / 1000.0), now())`,
        [record.id, JSON.stringify(record), at],
      );
      return record;
    },

    async commitDecision({ submission, user, decision }) {
      const client = await pool().connect();
      try {
        await client.query('begin');
        await this.updateSubmission(submission, { client });
        const updated = await client.query(
          `update public.wigofly_users
           set data = data || jsonb_build_object('kycStatus', $2::text),
               updated_at = now()
           where id = $1`,
          [String(user.id), String(user.kycStatus || 'none')],
        );
        if (!updated.rowCount) throw new Error('Utilisateur introuvable.');
        const record = await this.appendDecision(decision, { client });
        await client.query('commit');
        return record;
      } catch (error) {
        await client.query('rollback');
        throw error;
      } finally {
        client.release();
      }
    },

    async rejectionCountsByUser() {
      const result = await pool().query(
        `select data->>'userId' as user_id, count(*)::int as count
         from public.wigofly_kyc_submissions
         where data->>'status' in ('rejected', 'refused')
         group by data->>'userId'`,
      );
      return Object.fromEntries(
        result.rows.map((row) => [row.user_id, Number(row.count || 0)]),
      );
    },

    async verifiedUserCount() {
      const result = await pool().query(
        `select count(*)::int as count
         from public.wigofly_users
         where data->>'kycStatus' = 'verified'
           and nullif(data->>'deletedAt', '') is null`,
      );
      return Number(result.rows[0]?.count || 0);
    },
  };
}

function newSubmission(data) {
  return {
    id: relationalId('kyc'),
    submittedAt: Date.now(),
    status: 'pending',
    reviewedBy: null,
    reviewedAt: null,
    decisionReason: null,
    ...data,
  };
}

function hydrate(row) {
  return {
    ...(row.data || {}),
    id: row.data?.id || row.id,
  };
}
