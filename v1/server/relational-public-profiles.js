import { relationalId } from './relational-id.js';

export function relationalPublicProfileReadsEnabled(env = process.env) {
  return env.RELATIONAL_TRIP_READS === 'true'
    || env.RELATIONAL_OPERATION_READS === 'true'
    || env.RELATIONAL_OPERATION_WRITES === 'true';
}

export async function relationalPublicProfile({
  pool,
  userId,
  normalizeTransportMode,
}) {
  const result = await pool.query(
    `select u.data as user,
       coalesce((
         select jsonb_agg(candidate.data order by candidate.departure_date)
         from (
           select t.data,
             coalesce(t.data->>'departureDate', t.data->>'date') as departure_date
           from public.wigolink_trips t
           where t.data->>'travelerId' = $1
             and coalesce(t.data->>'status', 'published') = 'published'
             and coalesce(t.data->>'departureDate', t.data->>'date') >= current_date::text
           order by departure_date
           limit 4
         ) candidate
       ), '[]'::jsonb) as trips
     from public.wigolink_users u
     where u.id = $1`,
    [userId],
  );
  const row = result.rows[0];
  if (!row) return response(404, { error: 'Introuvable' });
  const user = row.user;
  return response(200, {
    user: publicUser(user),
    trips: (row.trips || []).map((trip) => ({
      id: trip.id,
      from: trip.from,
      to: trip.to,
      departureDate: trip.departureDate || trip.date,
      transportMode: normalizeTransportMode(trip.transportMode),
      price: trip.price,
      currency: trip.currency || 'EUR',
      capacityKg: trip.capacityKg,
    })),
    stats: {
      completed: user.completed || 0,
      rating: user.rating,
      ratingCount: user.ratingCount || 0,
      cancelRate: user.cancelRate || 0,
    },
  });
}

export async function relationalPublicReviews({ pool, userId, limit = 100 }) {
  const userResult = await pool.query(
    `select data from public.wigolink_users where id = $1`,
    [userId],
  );
  const target = userResult.rows[0]?.data;
  if (!target) return response(404, { error: 'Introuvable' });
  const result = await pool.query(
    `select
       rating.value as rating,
       author.data->>'name' as author_name
     from public.wigolink_transactions tx
     cross join lateral jsonb_array_elements(
       coalesce(tx.data->'ratings', '[]'::jsonb)
     ) rating(value)
     left join public.wigolink_users author
       on author.id = rating.value->>'by'
     where rating.value->>'target' = $1
     order by coalesce((rating.value->>'at')::bigint, 0) desc
     limit $2`,
    [userId, Math.max(1, Math.min(100, Number(limit) || 100))],
  );
  return response(200, {
    reviews: result.rows.map((row) => ({
      stars: Number(row.rating?.stars || 0),
      comment: row.rating?.comment || null,
      at: Number(row.rating?.at || 0),
      authorName: row.author_name || 'Membre Wigolink',
    })),
    rating: target.rating,
    ratingCount: target.ratingCount,
  });
}

export async function rateRelationalOperation({
  pool,
  transactionId,
  user,
  body = {},
  detectLeak,
  now = Date.now,
}) {
  const targetId = String(body.targetId || '');
  const stars = Number(body.stars);
  const comment = String(body.comment || '').trim().slice(0, 400);
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
    return response(400, { error: 'Note invalide (1 a 5)' });
  }
  if (comment && detectLeak(comment)) {
    return response(400, {
      error: "L'avis ne peut pas contenir de coordonnees de contact",
    });
  }

  const client = await pool.connect();
  try {
    await client.query('begin');
    const transactionResult = await client.query(
      `select data from public.wigolink_transactions
       where id = $1 for update`,
      [transactionId],
    );
    const transaction = transactionResult.rows[0]?.data;
    if (!transaction || (
      transaction.status !== 'released'
      && transaction.operationStatus !== 'termine'
    )) {
      return await rollback(client, 400, {
        error: 'Notation apres livraison uniquement',
      });
    }
    const participants = new Set([
      transaction.senderId,
      transaction.travelerId,
      transaction.recipientId,
    ].filter(Boolean));
    if (!participants.has(user.id)) {
      return await rollback(client, 403, { error: 'Non autorise' });
    }
    if (!participants.has(targetId) || targetId === user.id) {
      return await rollback(client, 400, { error: 'Cible invalide' });
    }
    const targetResult = await client.query(
      `select data from public.wigolink_users where id = $1 for update`,
      [targetId],
    );
    const target = targetResult.rows[0]?.data;
    if (!target) {
      return await rollback(client, 400, { error: 'Cible invalide' });
    }
    transaction.ratings = Array.isArray(transaction.ratings)
      ? transaction.ratings
      : [];
    if (transaction.ratings.some((rating) => (
      rating.by === user.id && rating.target === targetId
    ))) {
      return await rollback(client, 400, { error: 'Deja note' });
    }
    const at = now();
    transaction.ratings.push({
      by: user.id,
      target: targetId,
      stars,
      comment: comment || null,
      at,
    });
    const ratingCount = Number(target.ratingCount) || 0;
    const previousTotal = (Number(target.rating) || 0) * ratingCount;
    target.ratingCount = ratingCount + 1;
    target.rating = Math.round(
      ((previousTotal + stars) / target.ratingCount) * 10,
    ) / 10;
    transaction.events = Array.isArray(transaction.events)
      ? transaction.events
      : [];
    transaction.events.push({
      id: relationalId('e'),
      type: 'rated',
      actorId: user.id,
      meta: { target: targetId, stars },
      at,
    });
    await updateRecord(client, 'wigolink_transactions', transaction);
    await updateRecord(client, 'wigolink_users', target);
    await client.query('commit');
    return response(200, { ok: true });
  } catch {
    await client.query('rollback').catch(() => {});
    return response(503, {
      error: 'Notation temporairement indisponible.',
    });
  } finally {
    client.release();
  }
}

async function updateRecord(client, table, value) {
  await client.query(
    `update public.${table}
     set data = $2::jsonb, updated_at = now()
     where id = $1`,
    [value.id, JSON.stringify(value)],
  );
}

async function rollback(client, status, body) {
  await client.query('rollback');
  return response(status, body);
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    city: user.city,
    kycStatus: user.kycStatus,
    rating: user.rating,
    ratingCount: user.ratingCount,
    completed: user.completed,
    cancelRate: user.cancelRate,
    badges: user.badges,
    photoUrl: user.photoUrl || null,
    isAdmin: !!user.isAdmin,
    createdAt: user.createdAt,
    emailVerified: !!user.emailVerified,
  };
}

function response(status, body) {
  return { status, body };
}
