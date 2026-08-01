import crypto from 'node:crypto';

const EMAIL_VERIFICATION_KIND = 'email_verification';
const PASSWORD_RESET_KIND = 'password_reset';
const ACCOUNT_CONFIRMATION_KIND = 'account_confirmation';

export function relationalAuthEnabled(env = process.env) {
  return env.RELATIONAL_AUTH === 'true';
}

export function createRelationalAuthRepositories({ getPool }) {
  const pool = () => {
    const value = getPool();
    if (!value || typeof value.query !== 'function') {
      throw new Error('La base relationnelle est indisponible.');
    }
    return value;
  };

  return {
    users: createRelationalUserRepository({ pool }),
    verifications: createRuntimeRepository({
      pool,
      kind: EMAIL_VERIFICATION_KIND,
    }),
    resets: createRuntimeRepository({
      pool,
      kind: PASSWORD_RESET_KIND,
    }),
    confirmations: createRuntimeRepository({
      pool,
      kind: ACCOUNT_CONFIRMATION_KIND,
      hashId: false,
    }),
  };
}

function createRelationalUserRepository({ pool }) {
  return {
    async findById(id) {
      if (!id) return null;
      const result = await pool().query(
        `select data
         from public.wigolink_users
         where id = $1
         limit 1`,
        [String(id)],
      );
      return result.rows[0]?.data || null;
    },

    async findByEmail(email) {
      const normalized = normalizeEmail(email);
      if (!normalized) return null;
      const result = await pool().query(
        `select data
         from public.wigolink_users
         where lower(data->>'email') = $1
         limit 1`,
        [normalized],
      );
      return result.rows[0]?.data || null;
    },

    async findByGoogleSubject(subject) {
      const normalized = String(subject || '').trim();
      if (!normalized) return null;
      const result = await pool().query(
        `select data
         from public.wigolink_users
         where data->>'googleSubject' = $1
         limit 1`,
        [normalized],
      );
      return result.rows[0]?.data || null;
    },

    async append(user) {
      await pool().query(
        `insert into public.wigolink_users (id, data, created_at, updated_at)
         values ($1, $2::jsonb, coalesce(to_timestamp($3 / 1000.0), now()), now())`,
        [
          String(user.id),
          JSON.stringify(user),
          finiteTimestamp(user.createdAt),
        ],
      );
      return user;
    },

    async update(user) {
      if (!user?.id) throw new Error('Utilisateur invalide.');
      const result = await pool().query(
        `update public.wigolink_users
         set data = $2::jsonb, updated_at = now()
         where id = $1
         returning data`,
        [String(user.id), JSON.stringify(user)],
      );
      if (!result.rowCount) throw new Error('Utilisateur introuvable.');
      return result.rows[0].data;
    },

    async updateChanged(user, before = {}) {
      if (!user?.id) throw new Error('Utilisateur invalide.');
      const patch = changedTopLevelFields(before, user);
      if (!Object.keys(patch).length) return user;
      const result = await pool().query(
        `update public.wigolink_users
         set data = data || $2::jsonb, updated_at = now()
         where id = $1
         returning data`,
        [String(user.id), JSON.stringify(patch)],
      );
      if (!result.rowCount) throw new Error('Utilisateur introuvable.');
      return result.rows[0].data;
    },
  };
}

function createRuntimeRepository({ pool, kind, hashId = true }) {
  return {
    async get(id) {
      const ids = runtimeIds(id, { hashId });
      const result = await pool().query(
        `select id, data
         from public.wigolink_runtime_records
         where kind = $1 and id = any($2::text[])
         order by case when id = $3 then 0 else 1 end
         limit 1`,
        [kind, ids, ids[0]],
      );
      return result.rows[0]?.data || null;
    },

    async set(id, value) {
      const ids = runtimeIds(id, { hashId });
      const expires = finiteExpiry(value);
      await pool().query(
        `insert into public.wigolink_runtime_records
           (kind, id, data, expires_at, updated_at)
         values ($1, $2, $3::jsonb, $4, now())
         on conflict (kind, id) do update
         set data = excluded.data,
             expires_at = excluded.expires_at,
             updated_at = now()`,
        [kind, ids[0], JSON.stringify(value || {}), expires],
      );
      if (ids[1] !== ids[0]) {
        await pool().query(
          `delete from public.wigolink_runtime_records
           where kind = $1 and id = $2`,
          [kind, ids[1]],
        );
      }
      return value;
    },

    async remove(id) {
      await pool().query(
        `delete from public.wigolink_runtime_records
         where kind = $1 and id = any($2::text[])`,
        [kind, runtimeIds(id, { hashId })],
      );
    },
  };
}

function runtimeIds(value, { hashId }) {
  const normalized = normalizeEmail(value);
  if (!hashId) return [normalized, normalized];
  const hashed = crypto.createHash('sha256').update(normalized).digest('hex');
  return [hashed, normalized];
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function finiteTimestamp(value) {
  const timestamp = Number(value);
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : Date.now();
}

function finiteExpiry(value) {
  const timestamp = Number(value?.expires || value?.expiresAt || 0);
  return Number.isFinite(timestamp) && timestamp > 0 ? new Date(timestamp) : null;
}

function changedTopLevelFields(before, after) {
  const patch = {};
  const keys = new Set([
    ...Object.keys(before || {}),
    ...Object.keys(after || {}),
  ]);
  for (const key of keys) {
    if (JSON.stringify(before?.[key]) === JSON.stringify(after?.[key])) continue;
    patch[key] = after?.[key] === undefined ? null : after[key];
  }
  return patch;
}
