const DEFAULT_LIMIT = 40;
const MAX_LIMIT = 100;

export function relationalTripReadsEnabled(env = process.env) {
  return env.RELATIONAL_TRIP_READS === 'true';
}

export async function relationalUserFromSession({ token, getSession, pool }) {
  const session = await getSession(token);
  if (!session?.userId) return null;
  const result = await pool.query('select data from public.wigofly_users where id = $1', [session.userId]);
  return result.rows[0]?.data || null;
}

export async function listRelationalTrips({ pool, user, query = {}, mine = false, today }) {
  const params = [today];
  const where = [
    "coalesce(t.data->>'status', 'published') = 'published'",
    "coalesce(t.data->>'departureDate', t.data->>'date') >= $1",
  ];
  if (mine) {
    params.push(user.id);
    where.push(`t.data->>'travelerId' = $${params.length}`);
  } else {
    where.push("u.data->>'kycStatus' = 'verified'");
    if (query.excludeMine === '1') {
      params.push(user.id);
      where.push(`t.data->>'travelerId' <> $${params.length}`);
    }
  }
  addContains(where, params, "t.data->>'from'", query.from);
  addContains(where, params, "t.data->>'to'", query.to);
  if (query.date) {
    params.push(String(query.date));
    where.push(`coalesce(t.data->>'departureDate', t.data->>'date') >= $${params.length}`);
  }
  addMinimum(where, params, "coalesce(nullif(t.data->>'capacityKg', '')::numeric, 0)", query.capacityKg);
  addMaximum(where, params, "coalesce(nullif(t.data->>'price', '')::numeric, 25)", query.maxPrice);
  if (query.q) {
    params.push(`%${String(query.q).trim()}%`);
    where.push(`concat_ws(' ', t.data->>'from', t.data->>'to', t.data->>'description', u.data->>'name') ilike $${params.length}`);
  }

  const limit = boundedLimit(query.limit);
  const offset = boundedOffset(query.offset);
  params.push(user.id, limit, offset);
  const userParam = `$${params.length - 2}`;
  const limitParam = `$${params.length - 1}`;
  const offsetParam = `$${params.length}`;
  const activeOperationSql = mine
    ? `, (select count(*)::int from public.wigofly_transactions tx
          where tx.data->>'tripId' = t.id
            and coalesce(tx.data->>'status', '') not in ('released', 'refunded', 'cancelled')) as active_operations`
    : '';
  const result = await pool.query(
    `select t.data as trip, u.data as traveler,
       exists(select 1 from public.wigofly_saved_trips s
         where s.data->>'userId' = ${userParam} and s.data->>'tripId' = t.id) as saved
       ${activeOperationSql}
     from public.wigofly_trips t
     join public.wigofly_users u on u.id = t.data->>'travelerId'
     where ${where.join(' and ')}
     order by coalesce(t.data->>'departureDate', t.data->>'date') asc, t.created_at desc
     limit ${limitParam} offset ${offsetParam}`,
    params
  );
  const trips = result.rows.map((row) => tripView(row.trip, row.traveler, row.saved, row.active_operations));
  return {
    trips,
    page: { limit, offset, hasMore: trips.length === limit, nextOffset: trips.length === limit ? offset + limit : null },
  };
}

function tripView(trip, traveler, saved, activeOperations) {
  const date = trip.departureDate || trip.date;
  return {
    ...trip,
    departureDate: date,
    ticketDate: trip.ticketDate || trip.date,
    price: Number(trip.price ?? trip.proposedPrice ?? trip.travelerPay ?? trip.priceEur ?? 25),
    currency: trip.currency || 'EUR',
    capacityKg: Number(trip.capacityKg || 0),
    description: trip.description || 'Voyageur disponible pour transporter un colis propre et conforme.',
    conditions: trip.conditions || 'Petit colis propre, ferme et conforme aux regles douanieres.',
    status: trip.status || 'published',
    traveler: publicUser(traveler),
    saved: !!saved,
    ...(activeOperations === undefined ? {} : { activeOperations: Number(activeOperations || 0) }),
  };
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id, name: user.name, city: user.city, kycStatus: user.kycStatus, rating: user.rating,
    ratingCount: user.ratingCount, completed: user.completed, cancelRate: user.cancelRate,
    badges: user.badges, photoUrl: user.photoUrl || null, isAdmin: !!user.isAdmin,
    createdAt: user.createdAt, onboardingDone: !!user.settings?.onboardingDone,
    emailVerified: !!user.emailVerified,
  };
}

function addContains(where, params, column, value) {
  if (!value || !String(value).trim()) return;
  params.push(`%${String(value).trim()}%`);
  where.push(`${column} ilike $${params.length}`);
}

function addMinimum(where, params, column, value) {
  if (value === undefined || value === null || String(value).trim() === '') return;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return;
  params.push(numeric);
  where.push(`${column} >= $${params.length}`);
}

function addMaximum(where, params, column, value) {
  if (value === undefined || value === null || String(value).trim() === '') return;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return;
  params.push(numeric);
  where.push(`${column} <= $${params.length}`);
}

function boundedLimit(value) {
  const number = Number(value || DEFAULT_LIMIT);
  return Math.max(1, Math.min(MAX_LIMIT, Number.isFinite(number) ? Math.floor(number) : DEFAULT_LIMIT));
}

function boundedOffset(value) {
  const number = Number(value || 0);
  return Math.max(0, Number.isFinite(number) ? Math.floor(number) : 0);
}
